package graphmodels

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Dataset struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID  Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name       string    `gorm:"type:text;not null;unique"`
	Uri        string    `gorm:"type:text;not null"`
	ConfigJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}

func (d *Dataset) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		d.ID = id
	}
	return nil
}

func (d *Dataset) Validate() error {
	if d.Name == "" {
		return errors.New("dataset name is required")
	}
	if d.Uri == "" {
		return errors.New("dataset uri is required")
	}
	return nil
}

func (d *Dataset) Save(ctx context.Context, db *gorm.DB) error {
	if err := d.Validate(); err != nil {
		return err
	}
	if d.ID == uuid.Nil {
		return db.WithContext(ctx).Create(d).Error
	}
	return db.WithContext(ctx).Save(d).Error
}
