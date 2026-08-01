package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)
type PageVersion struct{ ent.Schema }
func (PageVersion) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (PageVersion) Fields() []ent.Field { return []ent.Field{field.String("public_id").Unique().NotEmpty().Immutable(), field.String("organization_id").NotEmpty().Immutable(), field.String("version_name").NotEmpty(), field.String("device_type").NotEmpty(), field.String("viewport").NotEmpty(), field.String("fingerprint").Optional(), field.String("snapshot_asset_id").Optional()} }
func (PageVersion) Edges() []ent.Edge { return []ent.Edge{edge.From("project", Project.Type).Ref("page_versions").Unique().Required()} }
