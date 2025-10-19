package graphmodels

import (
	"context"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Metric struct {
	gorm.Model
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Name      string    `gorm:"type:text;not null"`
	Value     float64   `gorm:"not null"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}

func (m *Metric) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		m.ID = id
	}
	return nil
}

func (m *Metric) Save(ctx context.Context, db *gorm.DB) error {
	if m.ID == uuid.Nil {
		return db.WithContext(ctx).Create(m).Error
	}
	return db.WithContext(ctx).Save(m).Error
}
