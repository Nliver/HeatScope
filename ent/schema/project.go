package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Project is the root record. Tenant fields are explicit so every later query
// can be scoped by organization before loading URLs or assets.
type Project struct{ ent.Schema }
func (Project) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Project) Fields() []ent.Field { return []ent.Field{
	field.String("public_id").Unique().NotEmpty().Immutable(), field.String("organization_id").NotEmpty().Immutable(), field.String("name").NotEmpty(), field.String("url").NotEmpty(), field.String("goal").NotEmpty(), field.String("device").NotEmpty(), field.String("viewport").NotEmpty(), field.String("status").Default("draft"),
} }
func (Project) Edges() []ent.Edge { return []ent.Edge{edge.To("page_versions", PageVersion.Type), edge.To("assets", Asset.Type), edge.To("jobs", Job.Type)} }
