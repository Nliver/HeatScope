package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type UiBlueprint struct{ ent.Schema }

func (UiBlueprint) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (UiBlueprint) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("comparison_id").Optional(),
		field.String("source_candidate_id").Optional(),
		field.String("schema_version").NotEmpty(),
		field.JSON("definition", map[string]any{}),
		field.Enum("review_status").Values("draft", "approved", "rejected").Default("draft"),
	}
}
func (UiBlueprint) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id")} }

type EventContract struct{ ent.Schema }

func (EventContract) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (EventContract) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("blueprint_id").Optional(),
		field.String("page_version").NotEmpty(),
		field.JSON("events", []map[string]any{}),
		field.Enum("status").Values("draft", "approved", "implemented", "verified").Default("draft"),
	}
}

type Experiment struct{ ent.Schema }

func (Experiment) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Experiment) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("baseline_version").NotEmpty(),
		field.String("treatment_version").NotEmpty(),
		field.JSON("definition", map[string]any{}),
		field.Enum("status").Values("draft", "running", "completed", "stopped").Default("draft"),
	}
}

type Export struct{ ent.Schema }

func (Export) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Export) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("requested_by").NotEmpty(),
		field.String("format").NotEmpty(),
		field.String("asset_id").Optional(),
		field.Enum("status").Values("queued", "processing", "ready", "failed").Default("queued"),
	}
}
