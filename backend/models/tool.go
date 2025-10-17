package models

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Tool struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Kind       string    `gorm:"type:text;not null"`
	Name       string    `gorm:"type:text;not null"`
	Version    string    `gorm:"type:text;not null"`
	ConfigJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}

func (t *Tool) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		t.ID = id
	}
	return nil
}

func (t *Tool) Validate() error {
	if t.Kind == "" {
		return errors.New("tool kind is required")
	}
	if t.Name == "" {
		return errors.New("tool name is required")
	}
	if t.Version == "" {
		return errors.New("tool version is required")
	}
	return nil
}

func (t *Tool) Save(ctx context.Context, db *gorm.DB) error {
	if err := t.Validate(); err != nil {
		return err
	}
	if t.ID == uuid.Nil {
		return db.WithContext(ctx).Create(t).Error
	}
	return db.WithContext(ctx).Save(t).Error
}
