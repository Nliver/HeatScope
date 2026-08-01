package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)
type Asset struct{ ent.Schema }
func (Asset) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Asset) Fields() []ent.Field { return []ent.Field{field.String("public_id").Unique().NotEmpty().Immutable(), field.String("organization_id").NotEmpty().Immutable(), field.String("object_key").NotEmpty().Unique(), field.String("sha256").NotEmpty(), field.String("content_type").NotEmpty(), field.Int64("size_bytes").NonNegative(), field.Enum("kind").Values("click_data", "heatmap", "page_snapshot", "html", "export")} }
func (Asset) Edges() []ent.Edge { return []ent.Edge{edge.From("project", Project.Type).Ref("assets").Unique().Required()} }
