package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Membership is intentionally independent from a local User table: the
// canonical identity stays in the organization's OIDC provider.
type Membership struct{ ent.Schema }

func (Membership) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Membership) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("subject_id").NotEmpty().Immutable(),
		field.Enum("role").Values("owner", "admin", "analyst", "editor", "viewer"),
		field.String("status").Default("active"),
	}
}
func (Membership) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "subject_id").Unique()} }
