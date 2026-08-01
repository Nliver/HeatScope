package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/heatscope/heatscope/ent"
	"github.com/heatscope/heatscope/ent/candidateartifact"
	"github.com/heatscope/heatscope/ent/clickobservation"
	"github.com/heatscope/heatscope/ent/idempotencyrecord"
	"github.com/heatscope/heatscope/ent/job"
	"github.com/heatscope/heatscope/ent/modelcomparison"
	"github.com/heatscope/heatscope/ent/modelexecution"
	"github.com/heatscope/heatscope/ent/modelprofile"
	"github.com/heatscope/heatscope/ent/organization"
	"github.com/heatscope/heatscope/ent/project"
	"github.com/heatscope/heatscope/internal/comparison"
	"github.com/heatscope/heatscope/internal/contracts"
	"github.com/heatscope/heatscope/internal/modelgateway"
	"github.com/heatscope/heatscope/internal/outbox"
	"github.com/heatscope/heatscope/internal/secrets"
	_ "github.com/lib/pq"
)

type principal struct { OrganizationID, SubjectID, Role string }
type application struct { db *ent.Client; vault secrets.Store; comparison comparison.Service }

func main() {
	ctx := context.Background()
	db, err := ent.Open(dialect.Postgres, env("DATABASE_URL", "postgres://heatscope:heatscope_local_only@postgres:5432/heatscope?sslmode=disable"))
	if err != nil { panic(fmt.Errorf("open database: %w", err)) }
	defer db.Close()
	if env("AUTO_MIGRATE", "false") == "true" { if err := db.Schema.Create(ctx); err != nil { panic(fmt.Errorf("run schema migration: %w", err)) } }
	vault := secrets.VaultKV{Address: os.Getenv("VAULT_ADDR"), Token: os.Getenv("VAULT_TOKEN"), Mount: env("VAULT_KV_MOUNT", "secret")}
	app := &application{db: db, vault: vault, comparison: comparison.Service{DB: db, Gateway: modelgateway.Gateway{Secrets: vault}}}
	if env("AUTH_MODE", "development") == "development" { app.ensureDevelopmentOrganization(ctx) }

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), requestID(), app.authentication())
	router.Use(cors.New(cors.Config{AllowOrigins: allowedOrigins(), AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodOptions}, AllowHeaders: []string{"Authorization", "Content-Type", "X-Request-ID", "X-Organization-ID", "X-Authenticated-Subject", "Idempotency-Key"}, ExposeHeaders: []string{"X-Request-ID"}, AllowCredentials: true, MaxAge: 12 * time.Hour}))
	v1 := router.Group("/api/v1")
	v1.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "heatscope-api"}) })
	v1.GET("/me", app.me)
	v1.GET("/projects", app.listProjects)
	v1.POST("/projects", app.createProject)
	v1.GET("/projects/:projectID", app.getProject)
	v1.GET("/projects/:projectID/click-observations", app.listClickObservations)
	v1.POST("/projects/:projectID/click-observations", app.importClickObservations)
	v1.GET("/model-profiles", app.listModelProfiles)
	v1.POST("/model-profiles", app.createModelProfile)
	v1.POST("/model-profiles/:profileID/secret", app.writeModelSecret)
	v1.POST("/model-profiles/:profileID/test", app.testModelProfile)
	v1.POST("/model-comparisons", app.createComparison)
	v1.GET("/model-comparisons/:comparisonID", app.getComparison)
	v1.POST("/model-comparisons/:comparisonID/decisions", app.reviewCandidate)
	v1.GET("/jobs/:jobID", app.getJob)
	if err := router.Run(":" + env("PORT", "8080")); err != nil { panic(err) }
}

func (a *application) authentication() gin.HandlerFunc {
	return func(c *gin.Context) {
		mode := env("AUTH_MODE", "development")
		organizationID, subjectID, role := c.GetHeader("X-Organization-ID"), c.GetHeader("X-Authenticated-Subject"), c.GetHeader("X-Role")
		if mode == "development" {
			if organizationID == "" { organizationID = env("DEVELOPMENT_ORGANIZATION_ID", "dev-org") }
			if subjectID == "" { subjectID = "development-user" }
			if role == "" { role = "owner" }
		} else if organizationID == "" || subjectID == "" {
			problem(c, http.StatusUnauthorized, "authentication-required", "需要经过 OIDC 网关验证的组织和用户身份")
			c.Abort(); return
		}
		c.Set("principal", principal{OrganizationID: organizationID, SubjectID: subjectID, Role: role})
		c.Next()
	}
}

func (a *application) ensureDevelopmentOrganization(ctx context.Context) {
	id := env("DEVELOPMENT_ORGANIZATION_ID", "dev-org")
	if _, err := a.db.Organization.Query().Where(organization.PublicIDEQ(id)).Only(ctx); err == nil { return }
	_, _ = a.db.Organization.Create().SetPublicID(id).SetName("Development Organization").Save(ctx)
}

func (a *application) me(c *gin.Context) { p := currentPrincipal(c); c.JSON(http.StatusOK, gin.H{"organization_id": p.OrganizationID, "subject_id": p.SubjectID, "role": p.Role}) }

func (a *application) listProjects(c *gin.Context) {
	p := currentPrincipal(c)
	records, err := a.db.Project.Query().Where(project.OrganizationIDEQ(p.OrganizationID)).Order(ent.Desc(project.FieldCreatedAt)).All(c)
	if err != nil { problem(c, http.StatusInternalServerError, "project-list-failed", "读取项目失败"); return }
	response := make([]contracts.ProjectResponse, 0, len(records))
	for _, record := range records { response = append(response, contracts.ProjectResponse{ID: record.PublicID, Name: record.Name, Status: record.Status, CreatedAt: record.CreatedAt}) }
	c.JSON(http.StatusOK, gin.H{"items": response})
}

func (a *application) createProject(c *gin.Context) {
	p := currentPrincipal(c)
	var request contracts.ProjectCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "项目参数无效: "+err.Error()); return }
	key, ok := idempotencyKey(c); if !ok { return }
	requestHash := hashRequest(request)
	if existing, err := a.db.IdempotencyRecord.Query().Where(idempotencyrecord.OrganizationIDEQ(p.OrganizationID), idempotencyrecord.KeyEQ(key)).Only(c); err == nil {
		if existing.RequestHash != requestHash { problem(c, http.StatusConflict, "idempotency-key-reused", "同一幂等键不能用于不同请求"); return }
		c.JSON(existing.StatusCode, existing.Response); return
	}
	record, err := a.db.Project.Create().SetPublicID(uuid.NewString()).SetOrganizationID(p.OrganizationID).SetName(request.Name).SetURL(request.URL).SetGoal(request.Goal).SetDevice(request.Device).SetViewport(request.Viewport).Save(c)
	if err != nil { problem(c, http.StatusInternalServerError, "project-create-failed", "创建项目失败"); return }
	response := contracts.ProjectResponse{ID: record.PublicID, Name: record.Name, Status: record.Status, CreatedAt: record.CreatedAt}
	_, _ = a.db.IdempotencyRecord.Create().SetOrganizationID(p.OrganizationID).SetKey(key).SetRequestHash(requestHash).SetStatusCode(http.StatusCreated).SetResponse(map[string]any{"id": response.ID, "name": response.Name, "status": response.Status, "created_at": response.CreatedAt.Format(time.RFC3339)}).Save(c)
	c.JSON(http.StatusCreated, response)
}

func (a *application) getProject(c *gin.Context) {
	p := currentPrincipal(c)
	record, err := a.db.Project.Query().Where(project.PublicIDEQ(c.Param("projectID")), project.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "project-not-found", "项目不存在或无权访问"); return }
	c.JSON(http.StatusOK, gin.H{"id": record.PublicID, "name": record.Name, "url": record.URL, "goal": record.Goal, "device": record.Device, "viewport": record.Viewport, "status": record.Status, "created_at": record.CreatedAt})
}

func (a *application) importClickObservations(c *gin.Context) {
	p := currentPrincipal(c); var request contracts.ClickObservationImportRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "点击数据格式无效: "+err.Error()); return }
	key, ok := idempotencyKey(c); if !ok { return }
	requestHash := hashRequest(request)
	if existing, err := a.db.IdempotencyRecord.Query().Where(idempotencyrecord.OrganizationIDEQ(p.OrganizationID), idempotencyrecord.KeyEQ(key)).Only(c); err == nil {
		if existing.RequestHash != requestHash { problem(c, http.StatusConflict, "idempotency-key-reused", "同一幂等键不能用于不同请求"); return }
		c.JSON(existing.StatusCode, existing.Response); return
	}
	projectRecord, err := a.db.Project.Query().Where(project.PublicIDEQ(c.Param("projectID")), project.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "project-not-found", "项目不存在"); return }
	importID := uuid.NewString()
	batch, err := a.db.DataImport.Create().SetPublicID(importID).SetOrganizationID(p.OrganizationID).SetProjectID(projectRecord.PublicID).SetAssetID("api-inline-" + importID).SetSourceType("normalized_click_observations").SetMappingVersion(request.MappingVersion).SetInputHash(request.SourceHash).SetStatus("processing").Save(c)
	if err != nil { problem(c, http.StatusInternalServerError, "import-create-failed", "创建导入批次失败"); return }
	creates := make([]*ent.ClickObservationCreate, 0, len(request.Rows))
	for _, row := range request.Rows {
		create := a.db.ClickObservation.Create().SetOrganizationID(p.OrganizationID).SetProjectID(projectRecord.PublicID).SetDataImportID(batch.PublicID).SetSourceRow(row.SourceRow).SetElementKey(row.ElementKey).SetElementName(row.ElementName).SetModuleID(row.ModuleID).SetSelector(row.Selector).SetElementLink(row.ElementLink).SetClickCount(row.ClickCount).SetDeviceType(row.DeviceType).SetPageVersion(row.PageVersion)
		if row.ClickUV != nil { create.SetClickUV(*row.ClickUV) }; if row.PagePV != nil { create.SetPagePV(*row.PagePV) }; if row.PageUV != nil { create.SetPageUV(*row.PageUV) }
		creates = append(creates, create)
	}
	if err := a.db.ClickObservation.CreateBulk(creates...).Exec(c); err != nil { _ = a.db.DataImport.UpdateOneID(batch.ID).SetStatus("failed").Exec(c); problem(c, http.StatusInternalServerError, "observation-import-failed", "写入点击观察失败"); return }
	quality := map[string]any{"row_count": len(request.Rows), "data_level": "L1", "limitations": []string{"点击次数不是点击 UV、转化或留存。"}}
	if err := a.db.DataImport.UpdateOneID(batch.ID).SetStatus("ready").SetQualityReport(quality).Exec(c); err != nil { problem(c, http.StatusInternalServerError, "import-finalize-failed", "完成导入批次失败"); return }
	response := map[string]any{"id": batch.PublicID, "status": "ready", "rows": len(request.Rows)}
	_, _ = a.db.IdempotencyRecord.Create().SetOrganizationID(p.OrganizationID).SetKey(key).SetRequestHash(requestHash).SetStatusCode(http.StatusCreated).SetResponse(response).Save(c)
	c.JSON(http.StatusCreated, response)
}

func (a *application) listClickObservations(c *gin.Context) {
	p := currentPrincipal(c)
	if _, err := a.db.Project.Query().Where(project.PublicIDEQ(c.Param("projectID")), project.OrganizationIDEQ(p.OrganizationID)).Only(c); err != nil { problem(c, http.StatusNotFound, "project-not-found", "项目不存在"); return }
	records, err := a.db.ClickObservation.Query().Where(clickobservation.OrganizationIDEQ(p.OrganizationID), clickobservation.ProjectIDEQ(c.Param("projectID"))).Order(ent.Desc(clickobservation.FieldClickCount)).Limit(100).All(c)
	if err != nil { problem(c, http.StatusInternalServerError, "observation-list-failed", "读取点击观察失败"); return }
	c.JSON(http.StatusOK, gin.H{"items": records, "data_level": "L1", "limitations": []string{"点击次数不是点击 UV、转化或留存。"}})
}

func (a *application) listModelProfiles(c *gin.Context) {
	p := currentPrincipal(c)
	profiles, err := a.db.ModelProfile.Query().Where(modelprofile.OrganizationIDEQ(p.OrganizationID)).Order(ent.Desc(modelprofile.FieldCreatedAt)).All(c)
	if err != nil { problem(c, http.StatusInternalServerError, "model-profile-list-failed", "读取模型档案失败"); return }
	response := make([]contracts.ModelProfileResponse, 0, len(profiles)); for _, profile := range profiles { response = append(response, profileResponse(profile)) }
	c.JSON(http.StatusOK, gin.H{"items": response})
}

func (a *application) createModelProfile(c *gin.Context) {
	p := currentPrincipal(c); var request contracts.ModelProfileCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "模型档案参数无效: "+err.Error()); return }
	if _, err := (&modelgateway.Gateway{}).ValidateEndpoint(request.BaseURL, request.WireAPI); err != nil { problem(c, http.StatusBadRequest, "unsafe-model-endpoint", err.Error()); return }
	record, err := a.db.ModelProfile.Create().SetPublicID(uuid.NewString()).SetOrganizationID(p.OrganizationID).SetName(request.Name).SetProvider(request.Provider).SetBaseURL(request.BaseURL).SetModelID(request.ModelID).SetWireAPI(request.WireAPI).SetReasoningEffort(request.ReasoningEffort).SetRequestTimeoutSeconds(defaultInt(request.RequestTimeoutSeconds, 90)).SetMaxOutputTokens(defaultInt(request.MaxOutputTokens, 4000)).Save(c)
	if err != nil { problem(c, http.StatusInternalServerError, "model-profile-create-failed", "创建模型档案失败"); return }
	c.JSON(http.StatusCreated, profileResponse(record))
}

func (a *application) writeModelSecret(c *gin.Context) {
	p := currentPrincipal(c); var request contracts.ModelSecretWriteRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "模型密钥格式无效"); return }
	record, err := a.db.ModelProfile.Query().Where(modelprofile.PublicIDEQ(c.Param("profileID")), modelprofile.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "model-profile-not-found", "模型档案不存在"); return }
	reference := fmt.Sprintf("org/%s/model-profiles/%s", p.OrganizationID, record.PublicID)
	if err := a.vault.Put(c, reference, request.APIKey); err != nil { problem(c, http.StatusServiceUnavailable, "secret-store-unavailable", err.Error()); return }
	if err := a.db.ModelProfile.UpdateOneID(record.ID).SetSecretRef(reference).Exec(c); err != nil { problem(c, http.StatusInternalServerError, "secret-reference-save-failed", "模型密钥引用保存失败"); return }
	c.Status(http.StatusNoContent)
}

func (a *application) testModelProfile(c *gin.Context) {
	p := currentPrincipal(c)
	record, err := a.db.ModelProfile.Query().Where(modelprofile.PublicIDEQ(c.Param("profileID")), modelprofile.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "model-profile-not-found", "模型档案不存在"); return }
	result, err := a.comparison.Gateway.Run(c, modelgateway.Profile{ID: record.PublicID, Provider: record.Provider, Name: record.Name, BaseURL: record.BaseURL, ModelID: record.ModelID, WireAPI: record.WireAPI, ReasoningEffort: record.ReasoningEffort, SecretRef: record.SecretRef, TimeoutSeconds: record.RequestTimeoutSeconds, MaxOutputTokens: record.MaxOutputTokens}, modelgateway.Evidence{DataLevel: "L1", Project: map[string]any{"name": "连接测试"}, Observations: []modelgateway.Observation{{Ref: "click_observation:test", ElementName: "测试 CTA", ClickCount: 1}}, KnownEvidenceRefs: []string{"click_observation:test"}})
	if err != nil { problem(c, http.StatusBadGateway, "model-connection-failed", err.Error()); return }
	c.JSON(http.StatusOK, gin.H{"status": "ok", "latency_ms": result.Latency.Milliseconds(), "input_tokens": result.InputTokens, "output_tokens": result.OutputTokens})
}

func (a *application) createComparison(c *gin.Context) {
	p := currentPrincipal(c); var request contracts.ModelComparisonCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "模型对比参数无效: "+err.Error()); return }
	key, ok := idempotencyKey(c); if !ok { return }
	requestHash := hashRequest(request)
	if existing, err := a.db.IdempotencyRecord.Query().Where(idempotencyrecord.OrganizationIDEQ(p.OrganizationID), idempotencyrecord.KeyEQ(key)).Only(c); err == nil {
		if existing.RequestHash != requestHash { problem(c, http.StatusConflict, "idempotency-key-reused", "同一幂等键不能用于不同请求"); return }
		c.JSON(existing.StatusCode, existing.Response); return
	}
	comparisonRecord, executions, err := a.comparison.Freeze(c, comparison.CreateInput{OrganizationID: p.OrganizationID, ProjectID: request.ProjectID, AnalysisRunID: request.AnalysisRunID, ProfileIDs: request.ProfileIDs, PromptVersion: request.PromptVersion, MappingVersion: request.MappingVersion, RuleSetVersion: request.RuleSetVersion, SchemaVersion: request.SchemaVersion})
	if err != nil { problem(c, http.StatusUnprocessableEntity, "comparison-freeze-failed", err.Error()); return }
	jobID := uuid.NewString()
	projectRecord, _ := a.db.Project.Query().Where(project.PublicIDEQ(request.ProjectID), project.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if _, err := a.db.Job.Create().SetPublicID(jobID).SetOrganizationID(p.OrganizationID).SetKind("comparison").SetIdempotencyKey(key).SetProjectID(projectRecord.ID).Save(c); err != nil { problem(c, http.StatusInternalServerError, "job-create-failed", "创建任务失败"); return }
	if _, err := a.db.OutboxEvent.Create().SetPublicID(uuid.NewString()).SetOrganizationID(p.OrganizationID).SetTopic(outbox.TopicModelComparison).SetAggregateType("model_comparison").SetAggregateID(comparisonRecord.PublicID).SetPayload(map[string]any{"comparison_id": comparisonRecord.PublicID, "job_id": jobID, "project_id": request.ProjectID}).Save(c); err != nil { problem(c, http.StatusInternalServerError, "outbox-create-failed", "创建异步任务失败"); return }
	response := map[string]any{"id": comparisonRecord.PublicID, "status": comparisonRecord.Status, "frozen_input_hash": comparisonRecord.FrozenInputHash, "executions": len(executions), "job": map[string]any{"job_id": jobID, "status": "queued", "poll_url": "/api/v1/jobs/" + jobID}}
	_, _ = a.db.IdempotencyRecord.Create().SetOrganizationID(p.OrganizationID).SetKey(key).SetRequestHash(requestHash).SetStatusCode(http.StatusAccepted).SetResponse(response).Save(c)
	c.JSON(http.StatusAccepted, response)
}

func (a *application) getComparison(c *gin.Context) {
	p := currentPrincipal(c)
	comparisonRecord, err := a.db.ModelComparison.Query().Where(modelcomparison.PublicIDEQ(c.Param("comparisonID")), modelcomparison.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "comparison-not-found", "模型对比不存在或无权访问"); return }
	executions, _ := a.db.ModelExecution.Query().Where(modelexecution.ComparisonIDEQ(comparisonRecord.PublicID), modelexecution.OrganizationIDEQ(p.OrganizationID)).Order(ent.Asc(modelexecution.FieldCreatedAt)).All(c)
	candidates, _ := a.db.CandidateArtifact.Query().Where(candidateartifact.ComparisonIDEQ(comparisonRecord.PublicID), candidateartifact.OrganizationIDEQ(p.OrganizationID)).Order(ent.Asc(candidateartifact.FieldCreatedAt)).All(c)
	c.JSON(http.StatusOK, gin.H{"id": comparisonRecord.PublicID, "project_id": comparisonRecord.ProjectID, "status": comparisonRecord.Status, "frozen_input_hash": comparisonRecord.FrozenInputHash, "prompt_version": comparisonRecord.PromptVersion, "mapping_version": comparisonRecord.MappingVersion, "rule_set_version": comparisonRecord.RuleSetVersion, "schema_version": comparisonRecord.SchemaVersion, "summary": comparisonRecord.Summary, "executions": executions, "candidates": candidates})
}

func (a *application) reviewCandidate(c *gin.Context) {
	p := currentPrincipal(c); var request contracts.ReviewDecisionCreateRequest
	if err := c.ShouldBindJSON(&request); err != nil { problem(c, http.StatusBadRequest, "invalid-request", "审阅参数无效: "+err.Error()); return }
	comparisonRecord, err := a.db.ModelComparison.Query().Where(modelcomparison.PublicIDEQ(c.Param("comparisonID")), modelcomparison.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "comparison-not-found", "模型对比不存在"); return }
	if request.Decision != "merge" && request.CandidateID == "" { problem(c, http.StatusBadRequest, "candidate-required", "选择、驳回或评分必须指定候选"); return }
	if request.CandidateID != "" { candidate, err := a.db.CandidateArtifact.Query().Where(candidateartifact.PublicIDEQ(request.CandidateID), candidateartifact.ComparisonIDEQ(comparisonRecord.PublicID), candidateartifact.OrganizationIDEQ(p.OrganizationID)).Only(c); if err != nil { problem(c, http.StatusNotFound, "candidate-not-found", "候选不存在"); return }; status := map[string]string{"select":"selected", "merge":"merged", "reject":"rejected"}[request.Decision]; if status != "" { _ = a.db.CandidateArtifact.UpdateOneID(candidate.ID).SetReviewStatus(status).Exec(c) } }
	create := a.db.ReviewDecision.Create().SetPublicID(uuid.NewString()).SetOrganizationID(p.OrganizationID).SetComparisonID(comparisonRecord.PublicID).SetCandidateID(request.CandidateID).SetActorID(p.SubjectID).SetDecision(request.Decision).SetMergedContent(request.MergedContent).SetComment(request.Comment)
	if request.AccuracyScore != nil { create.SetAccuracyScore(*request.AccuracyScore) }; if request.InsightScore != nil { create.SetInsightScore(*request.InsightScore) }; if request.ActionabilityScore != nil { create.SetActionabilityScore(*request.ActionabilityScore) }
	record, err := create.Save(c); if err != nil { problem(c, http.StatusInternalServerError, "review-save-failed", "保存审阅决定失败"); return }
	c.JSON(http.StatusCreated, gin.H{"id": record.PublicID, "decision": record.Decision, "created_at": record.CreatedAt})
}

func (a *application) getJob(c *gin.Context) {
	p := currentPrincipal(c); record, err := a.db.Job.Query().Where(job.PublicIDEQ(c.Param("jobID")), job.OrganizationIDEQ(p.OrganizationID)).Only(c)
	if err != nil { problem(c, http.StatusNotFound, "job-not-found", "任务不存在"); return }
	c.JSON(http.StatusOK, gin.H{"job_id": record.PublicID, "kind": record.Kind, "status": record.Status, "error_code": record.ErrorCode, "error_message": record.ErrorMessage, "updated_at": record.UpdatedAt})
}

func profileResponse(record *ent.ModelProfile) contracts.ModelProfileResponse { return contracts.ModelProfileResponse{ID: record.PublicID, Name: record.Name, Provider: record.Provider, BaseURL: record.BaseURL, ModelID: record.ModelID, WireAPI: record.WireAPI, ReasoningEffort: record.ReasoningEffort, HasSecret: record.SecretRef != "", Enabled: record.Enabled} }
func currentPrincipal(c *gin.Context) principal { value, _ := c.Get("principal"); return value.(principal) }
func idempotencyKey(c *gin.Context) (string, bool) { key := strings.TrimSpace(c.GetHeader("Idempotency-Key")); if key == "" { problem(c, http.StatusBadRequest, "idempotency-key-required", "写操作必须携带 Idempotency-Key"); return "", false }; return key, true }
func hashRequest(value any) string { encoded, _ := json.Marshal(value); sum := sha256.Sum256(encoded); return hex.EncodeToString(sum[:]) }
func defaultInt(value, fallback int) int { if value == 0 { return fallback }; return value }
func requestID() gin.HandlerFunc { return func(c *gin.Context) { id := c.GetHeader("X-Request-ID"); if id == "" { id = uuid.NewString() }; c.Header("X-Request-ID", id); c.Next() } }
func problem(c *gin.Context, status int, code, detail string) { c.AbortWithStatusJSON(status, contracts.Problem{Type: "https://heatscope.dev/problems/" + code, Title: code, Status: status, Detail: detail}) }
func env(key, fallback string) string { if value := os.Getenv(key); value != "" { return value }; return fallback }
func allowedOrigins() []string { if value := os.Getenv("CORS_ORIGIN"); value != "" { return strings.Split(value, ",") }; return []string{"http://localhost:3000"} }
