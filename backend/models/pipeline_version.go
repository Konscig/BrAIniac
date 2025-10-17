package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type PipelineVersion struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Number    int       `gorm:"type:int;not null"`
	AuthorID  User      `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}
