package jobs

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
)

const (
	TypeImport  = "heatscope:import"
	TypeAnalyze = "heatscope:analyze"
	TypeExport  = "heatscope:export"
	TypeComparison = "heatscope:model-comparison"
)

type Payload struct {
	JobID          string `json:"job_id"`
	OrganizationID string `json:"organization_id"`
	ProjectID      string `json:"project_id"`
	ComparisonID   string `json:"comparison_id,omitempty"`
	ActorID        string `json:"actor_id"`
}

func NewTask(taskType string, payload Payload) (*asynq.Task, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal task payload: %w", err)
	}
	return asynq.NewTask(taskType, data), nil
}
