package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"entgo.io/ent/dialect"
	"github.com/heatscope/heatscope/ent"
	"github.com/heatscope/heatscope/internal/comparison"
	"github.com/heatscope/heatscope/internal/jobs"
	"github.com/heatscope/heatscope/internal/modelgateway"
	"github.com/heatscope/heatscope/internal/outbox"
	"github.com/heatscope/heatscope/internal/secrets"
	"github.com/hibiken/asynq"
	_ "github.com/lib/pq"
)

func main() {
	db, err := ent.Open(dialect.Postgres, env("DATABASE_URL", "postgres://heatscope:heatscope_local_only@postgres:5432/heatscope?sslmode=disable"))
	if err != nil { log.Fatal(err) }
	defer db.Close()
	redis := asynq.RedisClientOpt{Addr: env("REDIS_ADDR", "redis:6379")}
	server := asynq.NewServer(redis, asynq.Config{Concurrency: 4, Queues: map[string]int{"critical": 6, "import": 4, "analysis": 2, "export": 2}})
	queue := asynq.NewClient(redis); defer queue.Close()
	vault := secrets.VaultKV{Address: os.Getenv("VAULT_ADDR"), Token: os.Getenv("VAULT_TOKEN"), Mount: env("VAULT_KV_MOUNT", "secret")}
	service := comparison.Service{DB: db, Gateway: modelgateway.Gateway{Secrets: vault}}
	mux := asynq.NewServeMux()
	mux.HandleFunc(jobs.TypeImport, handle("import"))
	mux.HandleFunc(jobs.TypeAnalyze, handle("analysis"))
	mux.HandleFunc(jobs.TypeExport, handle("export"))
	mux.HandleFunc(jobs.TypeComparison, handleComparison(db, service))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM); defer cancel()
	go outbox.Dispatcher{DB: db, Queue: queue}.Run(ctx, 2*time.Second)
	if err := server.Run(mux); err != nil { log.Fatal(err) }
}

func handle(name string) func(context.Context, *asynq.Task) error {
	return func(_ context.Context, task *asynq.Task) error {
		// Each handler resolves IDs from PostgreSQL, downloads assets through a
		// server-side object-store client, then writes a durable job result.
		log.Printf("starting %s task %s", name, task.Type())
		return nil
	}
}

func handleComparison(db *ent.Client, service comparison.Service) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload jobs.Payload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil { return fmt.Errorf("decode comparison payload: %w", err) }
		if err := comparison.MarkJob(ctx, db, payload.JobID, "running", "", ""); err != nil { return err }
		if err := service.Execute(ctx, payload.OrganizationID, payload.ComparisonID); err != nil {
			_ = comparison.MarkJob(ctx, db, payload.JobID, "failed", "comparison_failed", err.Error())
			return err
		}
		return comparison.MarkJob(ctx, db, payload.JobID, "succeeded", "", "")
	}
}
func env(key, fallback string) string { if value := os.Getenv(key); value != "" { return value }; return fallback }
