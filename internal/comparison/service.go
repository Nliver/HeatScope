// Package comparison owns the frozen-input invariant and execution persistence.
package comparison

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/heatscope/heatscope/ent"
	"github.com/heatscope/heatscope/ent/clickobservation"
	"github.com/heatscope/heatscope/ent/job"
	"github.com/heatscope/heatscope/ent/modelcomparison"
	"github.com/heatscope/heatscope/ent/modelexecution"
	"github.com/heatscope/heatscope/ent/modelprofile"
	"github.com/heatscope/heatscope/ent/project"
	"github.com/heatscope/heatscope/internal/modelgateway"
)

type CreateInput struct {
	OrganizationID, ProjectID, AnalysisRunID, PromptVersion, MappingVersion, RuleSetVersion, SchemaVersion string
	ProfileIDs []string
}

type Service struct { DB *ent.Client; Gateway modelgateway.Gateway }

// Freeze creates an immutable comparison and one execution record per model.
// No provider call happens in the request transaction.
func (s Service) Freeze(ctx context.Context, input CreateInput) (*ent.ModelComparison, []*ent.ModelExecution, error) {
	if len(input.ProfileIDs) < 2 { return nil, nil, fmt.Errorf("模型对比至少选择两个已启用模型") }
	projectRecord, err := s.DB.Project.Query().Where(project.PublicIDEQ(input.ProjectID), project.OrganizationIDEQ(input.OrganizationID)).Only(ctx)
	if err != nil { return nil, nil, fmt.Errorf("读取项目失败: %w", err) }
	profiles, err := s.DB.ModelProfile.Query().Where(modelprofile.OrganizationIDEQ(input.OrganizationID), modelprofile.PublicIDIn(input.ProfileIDs...), modelprofile.EnabledEQ(true)).All(ctx)
	if err != nil { return nil, nil, fmt.Errorf("读取模型档案失败: %w", err) }
	if len(profiles) != len(input.ProfileIDs) { return nil, nil, fmt.Errorf("存在不可用或无权访问的模型档案") }
	evidence, err := s.buildEvidence(ctx, projectRecord)
	if err != nil { return nil, nil, err }
	hash, err := modelgateway.HashEvidence(evidence)
	if err != nil { return nil, nil, err }
	frozen, err := asMap(evidence)
	if err != nil { return nil, nil, err }
	comparisonID := uuid.NewString()
	comparisonRecord, err := s.DB.ModelComparison.Create().SetPublicID(comparisonID).SetOrganizationID(input.OrganizationID).SetProjectID(input.ProjectID).SetAnalysisRunID(input.AnalysisRunID).SetFrozenInputHash(hash).SetFrozenInput(frozen).SetPromptVersion(defaultValue(input.PromptVersion, "growth-analysis/2026-07-29.1")).SetMappingVersion(defaultValue(input.MappingVersion, "unconfirmed")).SetRuleSetVersion(defaultValue(input.RuleSetVersion, "core/2026-07-29.1")).SetSchemaVersion(defaultValue(input.SchemaVersion, modelgateway.CandidateSchemaVersion)).SetProfileIDs(input.ProfileIDs).Save(ctx)
	if err != nil { return nil, nil, fmt.Errorf("创建对比批次失败: %w", err) }
	executions := make([]*ent.ModelExecution, 0, len(profiles))
	for _, profile := range profiles {
		requestHash := hashString(hash + "|" + profile.PublicID + "|" + comparisonRecord.PromptVersion)
		execution, createErr := s.DB.ModelExecution.Create().SetPublicID(uuid.NewString()).SetOrganizationID(input.OrganizationID).SetComparisonID(comparisonID).SetProfileID(profile.PublicID).SetProvider(profile.Provider).SetModelID(profile.ModelID).SetRequestHash(requestHash).Save(ctx)
		if createErr != nil { return nil, nil, fmt.Errorf("创建模型执行失败: %w", createErr) }
		executions = append(executions, execution)
	}
	return comparisonRecord, executions, nil
}

func (s Service) Execute(ctx context.Context, organizationID, comparisonID string) error {
	comparisonRecord, err := s.DB.ModelComparison.Query().Where(modelcomparison.PublicIDEQ(comparisonID), modelcomparison.OrganizationIDEQ(organizationID)).Only(ctx)
	if err != nil { return fmt.Errorf("读取模型对比失败: %w", err) }
	if comparisonRecord.Status == "ready" { return nil }
	if err := s.DB.ModelComparison.UpdateOneID(comparisonRecord.ID).SetStatus("running").Exec(ctx); err != nil { return err }
	encoded, _ := json.Marshal(comparisonRecord.FrozenInput)
	var evidence modelgateway.Evidence
	if err := json.Unmarshal(encoded, &evidence); err != nil { return fmt.Errorf("冻结证据包损坏: %w", err) }
	executions, err := s.DB.ModelExecution.Query().Where(modelexecution.ComparisonIDEQ(comparisonID), modelexecution.StatusEQ("queued")).All(ctx)
	if err != nil { return err }
	for _, execution := range executions { if err := s.executeOne(ctx, comparisonRecord, execution, evidence); err != nil { /* persisted as failed; continue other models */ } }
	return s.finalize(ctx, comparisonRecord)
}

func (s Service) executeOne(ctx context.Context, comparisonRecord *ent.ModelComparison, execution *ent.ModelExecution, evidence modelgateway.Evidence) error {
	profile, err := s.DB.ModelProfile.Query().Where(modelprofile.PublicIDEQ(execution.ProfileID), modelprofile.OrganizationIDEQ(execution.OrganizationID)).Only(ctx)
	if err != nil { return s.failExecution(ctx, execution, "profile_unavailable", "模型档案不存在或无权限") }
	if err := s.DB.ModelExecution.UpdateOneID(execution.ID).SetStatus("running").Exec(ctx); err != nil { return err }
	result, err := s.Gateway.Run(ctx, modelgateway.Profile{ID: profile.PublicID, Provider: profile.Provider, Name: profile.Name, BaseURL: profile.BaseURL, ModelID: profile.ModelID, WireAPI: profile.WireAPI, ReasoningEffort: profile.ReasoningEffort, SecretRef: profile.SecretRef, TimeoutSeconds: profile.RequestTimeoutSeconds, MaxOutputTokens: profile.MaxOutputTokens}, evidence)
	if err != nil { return s.failExecution(ctx, execution, "provider_or_schema_error", err.Error()) }
	rawHash := hashJSON(result.RawResponse)
	if err := s.DB.ModelExecution.UpdateOneID(execution.ID).SetStatus("succeeded").SetResponseHash(rawHash).SetInputTokens(result.InputTokens).SetOutputTokens(result.OutputTokens).SetLatencyMS(int(result.Latency.Milliseconds())).SetRawResponse(result.RawResponse).Exec(ctx); err != nil { return err }
	return s.persistCandidates(ctx, comparisonRecord, execution, result.Bundle, evidence)
}

func (s Service) persistCandidates(ctx context.Context, comparisonRecord *ent.ModelComparison, execution *ent.ModelExecution, bundle modelgateway.Bundle, evidence modelgateway.Evidence) error {
	for _, candidate := range bundle.Insights { if err := s.saveCandidate(ctx, comparisonRecord, execution, "insight", candidate, evidence); err != nil { return err } }
	for _, candidate := range bundle.Plans { if err := s.saveCandidate(ctx, comparisonRecord, execution, "plan", candidate, evidence); err != nil { return err } }
	blueprint, err := asMap(bundle.Blueprint); if err != nil { return err }
	_, err = s.DB.CandidateArtifact.Create().SetPublicID(uuid.NewString()).SetOrganizationID(execution.OrganizationID).SetComparisonID(comparisonRecord.PublicID).SetExecutionID(execution.PublicID).SetKind("blueprint").SetNormalizedJSON(blueprint).SetEvidenceRefs(evidence.KnownEvidenceRefs).SetEvidenceCoverage(1).SetComplianceScore(1).SetImplementabilityScore(scoreBlueprint(bundle.Blueprint)).SetFlags([]string{}).Save(ctx)
	return err
}

func (s Service) saveCandidate(ctx context.Context, comparisonRecord *ent.ModelComparison, execution *ent.ModelExecution, kind string, candidate modelgateway.Candidate, evidence modelgateway.Evidence) error {
	normalized, err := asMap(candidate); if err != nil { return err }
	coverage := evidenceCoverage(candidate.EvidenceRefs, evidence.KnownEvidenceRefs)
	flags := []string{}
	if coverage < 1 { flags = append(flags, "evidence_reference_incomplete") }
	if evidence.DataLevel == "L1" && containsL1Violation(candidate.Claim+" "+candidate.Action) { flags = append(flags, "data_level_violation") }
	_, err = s.DB.CandidateArtifact.Create().SetPublicID(uuid.NewString()).SetOrganizationID(execution.OrganizationID).SetComparisonID(comparisonRecord.PublicID).SetExecutionID(execution.PublicID).SetKind(kind).SetNormalizedJSON(normalized).SetEvidenceRefs(candidate.EvidenceRefs).SetEvidenceCoverage(coverage).SetComplianceScore(scoreCompliance(flags)).SetImplementabilityScore(scoreCandidate(candidate)).SetFlags(flags).Save(ctx)
	return err
}

func (s Service) finalize(ctx context.Context, comparisonRecord *ent.ModelComparison) error {
	executions, err := s.DB.ModelExecution.Query().Where(modelexecution.ComparisonIDEQ(comparisonRecord.PublicID)).All(ctx); if err != nil { return err }
	succeeded, failed := 0, 0
	for _, execution := range executions { if execution.Status == "succeeded" { succeeded++ } else if execution.Status == "failed" || execution.Status == "invalid_output" { failed++ } }
	status := "ready"; if succeeded == 0 { status = "failed" } else if failed > 0 { status = "partial" }
	return s.DB.ModelComparison.UpdateOneID(comparisonRecord.ID).SetStatus(status).SetSummary(map[string]any{"succeeded": succeeded, "failed": failed, "finalized_at": time.Now().UTC().Format(time.RFC3339)}).Exec(ctx)
}

func (s Service) failExecution(ctx context.Context, execution *ent.ModelExecution, code, message string) error {
	return s.DB.ModelExecution.UpdateOneID(execution.ID).SetStatus("failed").SetFailureCode(code).SetFailureMessage(message).Exec(ctx)
}

func (s Service) buildEvidence(ctx context.Context, projectRecord *ent.Project) (modelgateway.Evidence, error) {
	records, err := s.DB.ClickObservation.Query().Where(clickobservation.OrganizationIDEQ(projectRecord.OrganizationID), clickobservation.ProjectIDEQ(projectRecord.PublicID)).Order(ent.Desc(clickobservation.FieldClickCount)).Limit(100).All(ctx)
	if err != nil { return modelgateway.Evidence{}, err }
	if len(records) == 0 { return modelgateway.Evidence{}, fmt.Errorf("尚无可用于模型对比的点击观察；请先完成数据导入") }
	evidence := modelgateway.Evidence{DataLevel: "L1", Project: map[string]any{"id": projectRecord.PublicID, "name": projectRecord.Name, "url": projectRecord.URL, "goal": projectRecord.Goal, "device": projectRecord.Device, "viewport": projectRecord.Viewport}}
	for _, record := range records {
		ref := fmt.Sprintf("click_observation:%d", record.ID)
		evidence.Observations = append(evidence.Observations, modelgateway.Observation{Ref: ref, ElementName: record.ElementName, ModuleID: record.ModuleID, ClickCount: record.ClickCount})
		evidence.KnownEvidenceRefs = append(evidence.KnownEvidenceRefs, ref)
	}
	return evidence, nil
}

func MarkJob(ctx context.Context, db *ent.Client, publicID, status, code, message string) error {
	update := db.Job.Update().Where(job.PublicIDEQ(publicID)).SetStatus(status)
	if code != "" { update.SetErrorCode(code) }; if message != "" { update.SetErrorMessage(message) }
	return update.Exec(ctx)
}

func asMap(value any) (map[string]any, error) { encoded, err := json.Marshal(value); if err != nil { return nil, err }; var result map[string]any; err = json.Unmarshal(encoded, &result); return result, err }
func hashString(value string) string { sum := sha256.Sum256([]byte(value)); return hex.EncodeToString(sum[:]) }
func hashJSON(value any) string { encoded, _ := json.Marshal(value); return hashString(string(encoded)) }
func defaultValue(value, fallback string) string { if value == "" { return fallback }; return value }
func scoreBlueprint(blueprint modelgateway.Blueprint) float64 { if len(blueprint.InformationArchitecture) > 1 && blueprint.PrimaryCTA != "" { return 1 }; return 0.5 }
func scoreCandidate(candidate modelgateway.Candidate) float64 { if candidate.Action != "" && candidate.Validation.Metric != "" && candidate.Validation.Guardrail != "" { return 1 }; if candidate.Action != "" && candidate.Validation.Metric != "" { return .7 }; return .3 }
func scoreCompliance(flags []string) float64 { if len(flags) == 0 { return 1 }; return .3 }
func containsL1Violation(value string) bool { for _, phrase := range []string{"转化提升", "留存提升", "收入提升", "必然提升", "导致"} { if strings.Contains(value, phrase) { return true } }; return false }
func evidenceCoverage(refs, known []string) float64 { if len(refs) == 0 { return 0 }; set := map[string]struct{}{}; for _, ref := range known { set[ref] = struct{}{} }; matched := 0; for _, ref := range refs { if _, ok := set[ref]; ok { matched++ } }; return float64(matched) / float64(len(refs)) }
