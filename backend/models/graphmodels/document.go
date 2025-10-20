package graphmodels

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Document struct {
	gorm.Model
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID uuid.UUID `gorm:"type:uuid;index"`
	DatasetID uuid.UUID `gorm:"type:uuid;index;null"`
	Content   string    `gorm:"type:text;not null"`
	Metadata  string    `gorm:"type:jsonb;not null;default:'{}'"`
	Embedding []byte    `gorm:"type:bytea;null"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}

func (d *Document) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		d.ID = id
	}
	return nil
}

func (d *Document) Validate() error {
	if d.Content == "" {
		return errors.New("document content required")
	}
	return nil
}

func (d *Document) Save(ctx context.Context, db *gorm.DB) error {
	if err := d.Validate(); err != nil {
		return err
	}
	if d.ID == uuid.Nil {
		return db.WithContext(ctx).Create(d).Error
	}
	return db.WithContext(ctx).Save(d).Error
}
