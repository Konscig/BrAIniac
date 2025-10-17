package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type Dataset struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID  Project   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name       string    `gorm:"type:text;not null;unique"`
	Uri        string    `gorm:"type:text;not null"`
	ConfigJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}
