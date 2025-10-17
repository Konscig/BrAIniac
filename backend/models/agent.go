package models

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Agent struct {
	gorm.Model
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID   Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name        string    `gorm:"type:text;not null;unique"`
	Description string    `gorm:"type:text;not null"`
	ConfigJSON  string    `gorm:"type:jsonb;not null"`
	Image       string    `gorm:"type:text;not null"`
	CreatedAt   time.Time `gorm:"default:now()"`
	UpdatedAt   time.Time `gorm:"default:now()"`
	DeletedAt   time.Time `gorm:"default:now()"`
}

func (a *Agent) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		a.ID = id
	}
	return nil
}

func (a *Agent) Validate() error {
	if a.Name == "" {
		return errors.New("agent name is required")
	}
	if a.Image == "" {
		return errors.New("agent image is required")
	}
	return nil
}

func (a *Agent) Save(ctx context.Context, db *gorm.DB) error {
	if err := a.Validate(); err != nil {
		return err
	}
	if a.ID == uuid.Nil {
		return db.WithContext(ctx).Create(a).Error
	}
	return db.WithContext(ctx).Save(a).Error
}

// UpdateConfig updates agent configuration JSON.
func (a *Agent) UpdateConfig(ctx context.Context, db *gorm.DB, configJSON string) error {
	a.ConfigJSON = configJSON
	return db.WithContext(ctx).Model(a).Update("config_json", configJSON).Error
}
