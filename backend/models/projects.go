package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type Project struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OwnerID   User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Name      string    `gorm:"type:text;not null;unique"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}
