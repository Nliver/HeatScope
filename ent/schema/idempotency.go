package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// IdempotencyRecord stores a stable response reference for retried writes.
// The request hash prevents a caller from reusing one key for another action.
type IdempotencyRecord struct{ ent.Schema }

func (IdempotencyRecord) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (IdempotencyRecord) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("key").NotEmpty().Immutable(),
		field.String("request_hash").NotEmpty(),
		field.Int("status_code"),
		field.JSON("response", map[string]any{}),
	}
}
func (IdempotencyRecord) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "key").Unique()} }
