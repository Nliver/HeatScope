package contracts

import "time"

// ProjectCreateRequest is the browser-to-API contract. Asset bytes are uploaded
// directly to S3-compatible storage and only asset IDs reach this API.
type ProjectCreateRequest struct {
	Name     string `json:"name" binding:"required,max=160"`
	URL      string `json:"url" binding:"required,url"`
	Goal     string `json:"goal" binding:"required,max=80"`
	Device   string `json:"device" binding:"required,max=80"`
	Viewport string `json:"viewport" binding:"required,max=40"`
}

type ModelProfileCreateRequest struct {
	Name                  string `json:"name" binding:"required,max=120"`
	Provider              string `json:"provider" binding:"required,max=80"`
	BaseURL               string `json:"base_url" binding:"required,url"`
	ModelID               string `json:"model_id" binding:"required,max=160"`
	WireAPI               string `json:"wire_api" binding:"required,oneof=chat_completions responses"`
	ReasoningEffort       string `json:"reasoning_effort" binding:"omitempty,max=20"`
	RequestTimeoutSeconds int    `json:"request_timeout_seconds" binding:"omitempty,min=5,max=300"`
	MaxOutputTokens       int    `json:"max_output_tokens" binding:"omitempty,min=256,max=16000"`
}

// ModelSecretWriteRequest is deliberately accepted only by the dedicated
// secret endpoint and never returned by any API, log, export, or database DTO.
type ModelSecretWriteRequest struct { APIKey string `json:"api_key" binding:"required,min=8,max=1024"` }

type ModelComparisonCreateRequest struct {
	ProjectID       string   `json:"project_id" binding:"required"`
	AnalysisRunID   string   `json:"analysis_run_id"`
	ProfileIDs      []string `json:"profile_ids" binding:"required,min=2,max=8"`
	PromptVersion   string   `json:"prompt_version" binding:"omitempty,max=80"`
	MappingVersion  string   `json:"mapping_version" binding:"omitempty,max=80"`
	RuleSetVersion  string   `json:"rule_set_version" binding:"omitempty,max=80"`
	SchemaVersion   string   `json:"schema_version" binding:"omitempty,max=80"`
}

type ClickObservationImportRequest struct {
	MappingVersion string `json:"mapping_version" binding:"required,max=80"`
	SourceHash string `json:"source_hash" binding:"required,len=64"`
	Rows []ClickObservationInput `json:"rows" binding:"required,min=1,max=5000,dive"`
}

type ClickObservationInput struct {
	SourceRow int `json:"source_row" binding:"min=0"`
	ElementKey string `json:"element_key" binding:"required,max=512"`
	ElementName string `json:"element_name" binding:"required,max=512"`
	ModuleID string `json:"module_id" binding:"omitempty,max=160"`
	Selector string `json:"selector" binding:"omitempty,max=2000"`
	ElementLink string `json:"element_link" binding:"omitempty,max=2000"`
	ClickCount int64 `json:"click_count" binding:"min=0"`
	ClickUV *int64 `json:"click_uv" binding:"omitempty,min=0"`
	PagePV *int64 `json:"page_pv" binding:"omitempty,min=0"`
	PageUV *int64 `json:"page_uv" binding:"omitempty,min=0"`
	DeviceType string `json:"device_type" binding:"omitempty,max=80"`
	PageVersion string `json:"page_version" binding:"omitempty,max=160"`
}

type ReviewDecisionCreateRequest struct {
	CandidateID         string         `json:"candidate_id"`
	Decision            string         `json:"decision" binding:"required,oneof=select merge reject rate"`
	MergedContent       map[string]any `json:"merged_content"`
	AccuracyScore       *int           `json:"accuracy_score" binding:"omitempty,min=1,max=5"`
	InsightScore        *int           `json:"insight_score" binding:"omitempty,min=1,max=5"`
	ActionabilityScore  *int           `json:"actionability_score" binding:"omitempty,min=1,max=5"`
	Comment             string         `json:"comment" binding:"omitempty,max=2000"`
}

type ProjectResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type ModelProfileResponse struct {
	ID string `json:"id"`
	Name string `json:"name"`
	Provider string `json:"provider"`
	BaseURL string `json:"base_url"`
	ModelID string `json:"model_id"`
	WireAPI string `json:"wire_api"`
	ReasoningEffort string `json:"reasoning_effort,omitempty"`
	HasSecret bool `json:"has_secret"`
	Enabled bool `json:"enabled"`
}

type JobResponse struct {
	JobID   string `json:"job_id"`
	Status  string `json:"status"`
	PollURL string `json:"poll_url"`
}

type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
}
