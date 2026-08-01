package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ModelProfile contains only metadata and a secret reference. The API key is
// written to a Vault/KMS backend and must never be stored in this table.
type ModelProfile struct{ ent.Schema }

func (ModelProfile) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ModelProfile) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("name").NotEmpty(),
		field.String("provider").NotEmpty(),
		field.String("base_url").NotEmpty(),
		field.String("model_id").NotEmpty(),
		field.Enum("wire_api").Values("chat_completions", "responses"),
		field.String("reasoning_effort").Optional(),
		field.String("secret_ref").Optional().Sensitive(),
		field.Int("request_timeout_seconds").Default(90),
		field.Int("max_output_tokens").Default(4000),
		field.Bool("enabled").Default(true),
	}
}
func (ModelProfile) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "name").Unique()} }

// ModelComparison freezes one and only one evidence package and policy for all
// model executions. A rerun creates a new comparison instead of mutating this.
type ModelComparison struct{ ent.Schema }

func (ModelComparison) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ModelComparison) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("analysis_run_id").Optional(),
		field.String("frozen_input_hash").NotEmpty(),
		field.JSON("frozen_input", map[string]any{}),
		field.String("prompt_version").NotEmpty(),
		field.String("mapping_version").NotEmpty(),
		field.String("rule_set_version").NotEmpty(),
		field.String("schema_version").NotEmpty(),
		field.JSON("profile_ids", []string{}),
		field.Enum("status").Values("queued", "running", "ready", "partial", "failed").Default("queued"),
		field.JSON("summary", map[string]any{}).Optional(),
	}
}
func (ModelComparison) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id")} }

type ModelExecution struct{ ent.Schema }

func (ModelExecution) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ModelExecution) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("comparison_id").NotEmpty().Immutable(),
		field.String("profile_id").NotEmpty().Immutable(),
		field.String("provider").NotEmpty(),
		field.String("model_id").NotEmpty(),
		field.Enum("status").Values("queued", "running", "succeeded", "failed", "truncated", "invalid_output").Default("queued"),
		field.String("request_hash").NotEmpty(),
		field.String("response_hash").Optional(),
		field.Int("input_tokens").Optional().NonNegative(),
		field.Int("output_tokens").Optional().NonNegative(),
		field.Float("cost_usd").Optional().NonNegative(),
		field.Int("latency_ms").Optional().NonNegative(),
		field.String("failure_code").Optional(),
		field.String("failure_message").Optional(),
		field.JSON("raw_response", map[string]any{}).Optional(),
	}
}
func (ModelExecution) Indexes() []ent.Index { return []ent.Index{index.Fields("comparison_id", "profile_id").Unique()} }

type CandidateArtifact struct{ ent.Schema }

func (CandidateArtifact) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (CandidateArtifact) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("comparison_id").NotEmpty().Immutable(),
		field.String("execution_id").NotEmpty().Immutable(),
		field.Enum("kind").Values("insight", "plan", "blueprint", "bundle"),
		field.JSON("normalized_json", map[string]any{}),
		field.JSON("evidence_refs", []string{}),
		field.Float("evidence_coverage").Min(0).Max(1),
		field.Float("compliance_score").Min(0).Max(1),
		field.Float("implementability_score").Min(0).Max(1),
		field.JSON("flags", []string{}),
		field.Enum("review_status").Values("pending", "selected", "merged", "rejected").Default("pending"),
	}
}
func (CandidateArtifact) Indexes() []ent.Index { return []ent.Index{index.Fields("comparison_id"), index.Fields("execution_id")} }

type ReviewDecision struct{ ent.Schema }

func (ReviewDecision) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ReviewDecision) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("comparison_id").NotEmpty().Immutable(),
		field.String("candidate_id").Optional(),
		field.String("actor_id").NotEmpty(),
		field.Enum("decision").Values("select", "merge", "reject", "rate"),
		field.JSON("merged_content", map[string]any{}).Optional(),
		field.Int("accuracy_score").Optional().Min(1).Max(5),
		field.Int("insight_score").Optional().Min(1).Max(5),
		field.Int("actionability_score").Optional().Min(1).Max(5),
		field.String("comment").Optional(),
	}
}
