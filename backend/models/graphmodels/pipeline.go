package graphmodels

import (
	"context"
	"errors"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Pipeline struct {
	gorm.Model
	ID                     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID              uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_pipeline_project_name"`
	Name                   string    `gorm:"type:text;not null;uniqueIndex:idx_pipeline_project_name"`
	Description            string    `gorm:"type:text;not null;default:''"`
	LastPublishedVersionID uuid.UUID `gorm:"type:uuid"`
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
