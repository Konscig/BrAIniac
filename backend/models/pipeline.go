package models

import (
	"context"
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Pipeline struct {
	gorm.Model
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID   Project         `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name        string          `gorm:"type:text;not null;unique"`
	LastVersion PipelineVersion `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:SET NULL"`
	CreatedAt   time.Time       `gorm:"default:now()"`
	UpdatedAt   time.Time       `gorm:"default:now()"`
	DeletedAt   time.Time       `gorm:"default:now()"`
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

// BumpVersion creates a new PipelineVersion and sets it as last.
func (p *Pipeline) BumpVersion(ctx context.Context, db *gorm.DB, author User) (*PipelineVersion, error) {
	var last PipelineVersion
	_ = db.WithContext(ctx).Model(&PipelineVersion{}).Order("number desc").Limit(1).Find(&last)
	newVersion := PipelineVersion{Number: last.Number + 1, AuthorID: author}
	if err := db.WithContext(ctx).Create(&newVersion).Error; err != nil {
		return nil, err
	}
	p.LastVersion = newVersion
	if err := db.WithContext(ctx).Model(p).Update("last_version", newVersion.ID).Error; err != nil {
		return nil, err
	}
	return &newVersion, nil
}
