package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type Metric struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Name      string    `gorm:"type:text;not null"`
	Value     float64   `gorm:"not null"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}
