package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

type Organization struct{ ent.Schema }

func (Organization) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (Organization) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("name").NotEmpty(),
		field.String("status").Default("active"),
	}
}
