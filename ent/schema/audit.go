package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AuditEvent struct{ ent.Schema }

func (AuditEvent) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (AuditEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("actor_id").NotEmpty(),
		field.String("action").NotEmpty(),
		field.String("resource_type").NotEmpty(),
		field.String("resource_id").NotEmpty(),
		field.String("trace_id").Optional(),
		field.JSON("metadata", map[string]any{}).Optional(),
	}
}
func (AuditEvent) Indexes() []ent.Index { return []ent.Index{index.Fields("organization_id", "created_at")} }

type OutboxEvent struct{ ent.Schema }

func (OutboxEvent) Mixin() []ent.Mixin { return []ent.Mixin{TimeMixin{}} }
func (OutboxEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("public_id").Unique().NotEmpty().Immutable(),
		field.String("organization_id").NotEmpty().Immutable(),
		field.String("topic").NotEmpty(),
		field.String("aggregate_type").NotEmpty(),
		field.String("aggregate_id").NotEmpty(),
		field.JSON("payload", map[string]any{}),
		field.Time("published_at").Optional().Nillable(),
		field.Int("attempts").Default(0),
	}
}
func (OutboxEvent) Indexes() []ent.Index { return []ent.Index{index.Fields("published_at")} }
