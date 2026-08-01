// Package outbox reliably transfers committed database events to Asynq. A
// duplicate delivery is harmless because the worker uses the persisted job and
// execution status as its idempotency boundary.
package outbox

import (
	"context"
	"fmt"
	"time"

	"github.com/heatscope/heatscope/ent"
	"github.com/heatscope/heatscope/ent/outboxevent"
	"github.com/heatscope/heatscope/internal/jobs"
	"github.com/hibiken/asynq"
)

const TopicModelComparison = "model_comparison.requested"

type Dispatcher struct { DB *ent.Client; Queue *asynq.Client }

func (d Dispatcher) Run(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every); defer ticker.Stop()
	for {
		if err := d.DispatchOnce(ctx, 50); err != nil { /* caller records this through process metrics/logging */ }
		select { case <-ctx.Done(): return; case <-ticker.C: }
	}
}

func (d Dispatcher) DispatchOnce(ctx context.Context, limit int) error {
	events, err := d.DB.OutboxEvent.Query().Where(outboxevent.PublishedAtIsNil()).Order(ent.Asc(outboxevent.FieldCreatedAt)).Limit(limit).All(ctx)
	if err != nil { return fmt.Errorf("query outbox: %w", err) }
	for _, event := range events {
		payload, err := payloadFor(event)
		if err != nil { _ = d.DB.OutboxEvent.UpdateOneID(event.ID).AddAttempts(1).Exec(ctx); continue }
		task, err := jobs.NewTask(jobs.TypeComparison, payload)
		if err == nil { _, err = d.Queue.Enqueue(task, asynq.Queue("analysis"), asynq.TaskID(event.PublicID), asynq.MaxRetry(4)) }
		if err != nil { _ = d.DB.OutboxEvent.UpdateOneID(event.ID).AddAttempts(1).Exec(ctx); continue }
		if err := d.DB.OutboxEvent.UpdateOneID(event.ID).SetPublishedAt(time.Now().UTC()).AddAttempts(1).Exec(ctx); err != nil { return fmt.Errorf("mark outbox published: %w", err) }
	}
	return nil
}

func payloadFor(event *ent.OutboxEvent) (jobs.Payload, error) {
	if event.Topic != TopicModelComparison { return jobs.Payload{}, fmt.Errorf("unsupported outbox topic %q", event.Topic) }
	comparisonID, _ := event.Payload["comparison_id"].(string)
	jobID, _ := event.Payload["job_id"].(string)
	projectID, _ := event.Payload["project_id"].(string)
	if comparisonID == "" || jobID == "" || projectID == "" { return jobs.Payload{}, fmt.Errorf("invalid comparison outbox payload") }
	return jobs.Payload{JobID: jobID, OrganizationID: event.OrganizationID, ProjectID: projectID, ComparisonID: comparisonID}, nil
}
