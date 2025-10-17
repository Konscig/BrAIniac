package models

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type RunTask struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	RunID      Run       `gorm:"foreignKey:RunID;constraint:OnDelete:CASCADE"`
	NodeID     Node      `gorm:"foreignKey:NodeID;constraint:OnDelete:CASCADE"`
	Worker     string    `gorm:"type:text;not null"`
	Status     string    `gorm:"type:text;not null"`
	Attempt    int       `gorm:"not null"`
	Metric     Metric    `gorm:"foreignKey:RunID;constraint:OnDelete:CASCADE"`
	LogsUri    string    `gorm:"type:text;not null"`
	OutputJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}

const (
	RunTaskStatusPending = "pending"
	RunTaskStatusRunning = "running"
	RunTaskStatusFailed  = "failed"
	RunTaskStatusDone    = "done"
)

func (t *RunTask) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		t.ID = id
	}
	if t.Status == "" {
		t.Status = RunTaskStatusPending
	}
	if t.Attempt == 0 {
		t.Attempt = 1
	}
	return nil
}

func (t *RunTask) Start(ctx context.Context, db *gorm.DB, worker string) error {
	if t.Status != RunTaskStatusPending {
		return errors.New("task not pending")
	}
	t.Status = RunTaskStatusRunning
	t.Worker = worker
	return db.WithContext(ctx).Model(t).Updates(map[string]any{"status": RunTaskStatusRunning, "worker": worker}).Error
}

func (t *RunTask) Retry(ctx context.Context, db *gorm.DB) error {
	t.Attempt += 1
	return db.WithContext(ctx).Model(t).Update("attempt", t.Attempt).Error
}

func (t *RunTask) Complete(ctx context.Context, db *gorm.DB, outputJSON string, success bool) error {
	if t.Status != RunTaskStatusRunning {
		return errors.New("task not running")
	}
	t.OutputJSON = outputJSON
	status := RunTaskStatusDone
	if !success {
		status = RunTaskStatusFailed
	}
	t.Status = status
	return db.WithContext(ctx).Model(t).Updates(map[string]any{"status": status, "output_json": outputJSON}).Error
}

func (t *RunTask) Save(ctx context.Context, db *gorm.DB) error {
	if t.ID == uuid.Nil {
		return db.WithContext(ctx).Create(t).Error
	}
	return db.WithContext(ctx).Save(t).Error
}
