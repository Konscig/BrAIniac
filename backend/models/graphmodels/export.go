package graphmodels

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Export struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID  Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Type       string    `gorm:"type:text;not null"`
	Uri        string    `gorm:"type:text;not null"`
	ConfigJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}

func (e *Export) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		e.ID = id
	}
	return nil
}

func (e *Export) Validate() error {
	if e.Type == "" {
		return errors.New("export type is required")
	}
	if e.Uri == "" {
		return errors.New("export uri is required")
	}
	return nil
}

func (e *Export) Save(ctx context.Context, db *gorm.DB) error {
	if err := e.Validate(); err != nil {
		return err
	}
	if e.ID == uuid.Nil {
		return db.WithContext(ctx).Create(e).Error
	}
	return db.WithContext(ctx).Save(e).Error
}
