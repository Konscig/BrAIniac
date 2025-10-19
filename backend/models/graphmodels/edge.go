package graphmodels

import (
	"context"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Edge struct {
	gorm.Model
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VersionID uuid.UUID `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:CASCADE"`
	FromNode  uuid.UUID `gorm:"foreignKey:VersionID,FromKey;references:VersionID,Key;unique"`
	ToNode    uuid.UUID `gorm:"foreignKey:VersionID,ToKey;references:VersionID,Key;unique"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}

func (e *Edge) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		e.ID = id
	}
	return nil
}

func (e *Edge) Save(ctx context.Context, db *gorm.DB) error {
	if e.ID == uuid.Nil {
		return db.WithContext(ctx).Create(e).Error
	}
	return db.WithContext(ctx).Save(e).Error
}
