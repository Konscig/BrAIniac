package graphmodels

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Pipeline struct {
	gorm.Model
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID   uuid.UUID `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name        string    `gorm:"type:text;not null;unique"`
	LastVersion uuid.UUID `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:SET NULL"`
	CreatedAt   time.Time `gorm:"default:now()"`
	UpdatedAt   time.Time `gorm:"default:now()"`
	DeletedAt   time.Time `gorm:"default:now()"`
}

func (p *Pipeline) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		p.ID = id
	}
	return nil
}

func (p *Pipeline) Validate() error {
	if p.Name == "" {
		return errors.New("pipeline name is required")
	}
	return nil
}

func (p *Pipeline) Save(ctx context.Context, db *gorm.DB) error {
	if err := p.Validate(); err != nil {
		return err
	}
	if p.ID == uuid.Nil {
		return db.WithContext(ctx).Create(p).Error
	}
	return db.WithContext(ctx).Save(p).Error
}
