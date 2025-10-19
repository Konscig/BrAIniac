package graphmodels

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Run struct {
	gorm.Model
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	PipelineVersion uuid.UUID `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:RESTRICT"`
	Author          uuid.UUID `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL"`
	Mode            string    `gorm:"type:text;not null"`
	Status          string    `gorm:"type:text;not null"`
	CreatedAt       time.Time `gorm:"default:now()"`
	UpdatedAt       time.Time `gorm:"default:now()"`
	DeletedAt       time.Time `gorm:"default:now()"`
}

const (
	RunStatusPending   = "pending"
	RunStatusRunning   = "running"
	RunStatusSucceeded = "succeeded"
	RunStatusFailed    = "failed"
)

func (r *Run) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		r.ID = id
	}
	if r.Status == "" {
		r.Status = RunStatusPending
	}
	return nil
}

func (r *Run) Start(ctx context.Context, db *gorm.DB) error {
	if r.Status != RunStatusPending {
		return errors.New("run not in pending state")
	}
	r.Status = RunStatusRunning
	return db.WithContext(ctx).Model(r).Update("status", RunStatusRunning).Error
}

func (r *Run) Complete(ctx context.Context, db *gorm.DB, success bool) error {
	if r.Status != RunStatusRunning {
		return errors.New("run not in running state")
	}
	if success {
		r.Status = RunStatusSucceeded
		return db.WithContext(ctx).Model(r).Update("status", RunStatusSucceeded).Error
	}
	r.Status = RunStatusFailed
	return db.WithContext(ctx).Model(r).Update("status", RunStatusFailed).Error
}

func (r *Run) Save(ctx context.Context, db *gorm.DB) error {
	if r.ID == uuid.Nil {
		return db.WithContext(ctx).Create(r).Error
	}
	return db.WithContext(ctx).Save(r).Error
}
