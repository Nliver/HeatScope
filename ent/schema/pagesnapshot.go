package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type PageSnapshot struct{ ent.Schema }

func (PageSnapshot) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (PageSnapshot) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("requested_url").NotEmpty(),
		field.String("final_url").Optional(),
		field.String("viewport").NotEmpty(),
		field.String("device_type").NotEmpty(),
		field.String("dom_hash").Optional(),
		field.String("screenshot_asset_id").Optional(),
		field.String("html_asset_id").Optional(),
		field.Enum("status").Values("queued", "captured", "blocked", "failed", "uploaded").Default("queued"),
	}
}
func (PageSnapshot) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "project_id")} }

type Module struct{ ent.Schema }

func (Module) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Module) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("snapshot_id").NotEmpty().Immutable(),
		field.String("module_key").NotEmpty(),
		field.String("name").NotEmpty(),
		field.Int("position").NonNegative(),
		field.String("purpose").Optional(),
		field.Enum("status").Values("proposed", "confirmed", "rejected").Default("proposed"),
	}
}
func (Module) Indexes() []ent.Index { return []ent.Index{index.Fields("snapshot_id", "module_key").Unique()} }

type ElementMapping struct{ ent.Schema }

func (ElementMapping) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (ElementMapping) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("project_id").NotEmpty().Immutable(),
		field.String("snapshot_id").NotEmpty().Immutable(),
		field.String("element_key").NotEmpty(),
		field.String("module_id").Optional(),
		field.String("selector").Optional(),
		field.String("label").NotEmpty(),
		field.Float("confidence").Min(0).Max(1),
		field.Enum("status").Values("proposed", "confirmed", "ambiguous", "rejected").Default("proposed"),
	}
}
func (ElementMapping) Indexes() []ent.Index { return []ent.Index{index.Fields("snapshot_id", "element_key").Unique()} }
