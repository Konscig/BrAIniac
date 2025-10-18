package authmodels

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type User struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Username        string    `gorm:"type:text;unique;not null"`
	PasswordHash    string    `gorm:"type:text;not null"`
	TokenValidAfter time.Time `gorm:"default:now()"`
	CreatedAt       time.Time `gorm:"default:now()"`
	UpdatedAt       time.Time `gorm:"default:now()"`
}
