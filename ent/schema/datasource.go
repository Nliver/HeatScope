package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// DataImport is an immutable input batch. Corrections are represented by a
// later import, never by overwriting the original source facts.
type DataImport struct{ ent.Schema }

func (DataImport) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (DataImport) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("asset_id").NotEmpty().Immutable(),
		field.String("source_type").NotEmpty(),
		field.String("mapping_version").NotEmpty(),
		field.Enum("status").Values("queued", "processing", "ready", "failed").Default("queued"),
		field.JSON("quality_report", map[string]any{}).Optional(),
		field.String("input_hash").NotEmpty(),
	}
}
func (DataImport) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id")} }

type ClickObservation struct{ ent.Schema }

func (ClickObservation) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ClickObservation) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("data_import_id").NotEmpty().Immutable(),
		field.Int("source_row").NonNegative(),
		field.String("element_key").NotEmpty(),
		field.String("element_name").NotEmpty(),
		field.String("module_id").Optional(),
		field.String("selector").Optional(),
		field.String("element_link").Optional(),
		field.Int64("click_count").NonNegative(),
		field.Int64("click_uv").Optional().NonNegative(),
		field.Int64("page_pv").Optional().NonNegative(),
		field.Int64("page_uv").Optional().NonNegative(),
		field.String("device_type").Optional(),
		field.String("page_version").Optional(),
	}
}
func (ClickObservation) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id"), index.Fields("data_import_id")} }
