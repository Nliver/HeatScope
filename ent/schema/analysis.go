package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type RuleSet struct{ ent.Schema }

func (RuleSet) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (RuleSet) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("name").NotEmpty(),
		field.String("version").NotEmpty(),
		field.JSON("definition", map[string]any{}),
		field.Bool("is_active").Default(true),
	}
}
func (RuleSet) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "name", "version").Unique()} }

type AnalysisRun struct{ ent.Schema }

func (AnalysisRun) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (AnalysisRun) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("page_snapshot_id").Optional(),
		field.String("data_import_id").Optional(),
		field.String("mapping_version").NotEmpty(),
		field.String("rule_set_version").NotEmpty(),
		field.String("input_hash").NotEmpty(),
		field.Enum("data_level").Values("L0", "L1", "L2", "L3", "L4"),
		field.Enum("status").Values("queued", "running", "ready", "failed").Default("queued"),
		field.JSON("evidence_package", map[string]any{}).Optional(),
	}
}
func (AnalysisRun) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id")} }

type Insight struct{ ent.Schema }

func (Insight) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Insight) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("analysis_run_id").NotEmpty().Immutable(),
		field.String("claim").NotEmpty(),
		field.JSON("evidence_refs", []string{}),
		field.JSON("assumptions", []string{}),
		field.String("action").Optional(),
		field.String("validation_metric").Optional(),
		field.String("guardrail_metric").Optional(),
		field.Enum("confidence").Values("low", "medium", "high").Default("low"),
		field.Enum("status").Values("draft", "approved", "rejected").Default("draft"),
	}
}
