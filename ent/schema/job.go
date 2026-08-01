package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)
type Job struct{ ent.Schema }
func (Job) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Job) Fields() []ent.Field { return []ent.Field{field.String("public_id").Unique().NotEmpty(), field.String("organization_id").NotEmpty().Immutable(), field.Enum("kind").Values("import", "analysis", "export", "capture", "comparison"), field.Enum("status").Values("queued", "running", "succeeded", "failed").Default("queued"), field.String("idempotency_key").NotEmpty(), field.String("error_code").Optional(), field.String("error_message").Optional()} }
func (Job) Edges() []ent.Edge { return []ent.Edge{edge.From("project", Project.Type).Ref("jobs").Unique().Required()} }
