package graphmodels

import (
	"context"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type PipelineVersion struct {
	gorm.Model
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Number    int       `gorm:"type:int;not null"`
	AuthorID  uuid.UUID `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}

func (v *PipelineVersion) BeforeCreate(tx *gorm.DB) error {
	if v.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		v.ID = id
	}
	return nil
}

func (v *PipelineVersion) Save(ctx context.Context, db *gorm.DB) error {
	if v.ID == uuid.Nil {
		return db.WithContext(ctx).Create(v).Error
	}
	return db.WithContext(ctx).Save(v).Error
}
