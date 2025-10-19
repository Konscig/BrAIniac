package graphmodels

import (
	"context"
	"errors"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Project struct {
	gorm.Model
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OwnerID     uuid.UUID `gorm:"type:uuid"`
	Name        string    `gorm:"type:text;not null;unique"`
	Description string    `gorm:"type:text;not null;default:''"`
}

// BeforeCreate ensures the project has a UUID.
func (p *Project) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		p.ID = id
	}
	return nil
}

// Validate performs basic validation on the project fields.
func (p *Project) Validate() error {
	if p.Name == "" {
		return errors.New("project name is required")
	}
	return nil
}

// Save creates or updates the project after validation.
func (p *Project) Save(ctx context.Context, db *gorm.DB) error {
	if err := p.Validate(); err != nil {
		return err
	}
	if p.ID == uuid.Nil {
		return db.WithContext(ctx).Create(p).Error
	}
	return db.WithContext(ctx).Save(p).Error
}

// FindProjectByName finds a project by unique name.
func FindProjectByName(ctx context.Context, db *gorm.DB, name string) (*Project, error) {
	var pr Project
	if err := db.WithContext(ctx).Where("name = ?", name).First(&pr).Error; err != nil {
		return nil, err
	}
	return &pr, nil
}
