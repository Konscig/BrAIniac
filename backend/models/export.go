package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Export struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID  Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Type       string    `gorm:"type:text;not null"`
	Uri        string    `gorm:"type:text;not null"`
	ConfigJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}
