package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Run struct {
	gorm.Model
	ID              uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	PipelineVersion PipelineVersion `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:RESTRICT"`
	Author          User            `gorm:"foreignKey:UserID;constraint:OnDelete:SET NULL"`
	Mode            string          `gorm:"type:text;not null"`
	Status          string          `gorm:"type:text;not null"`
	CreatedAt       time.Time       `gorm:"default:now()"`
	UpdatedAt       time.Time       `gorm:"default:now()"`
	DeletedAt       time.Time       `gorm:"default:now()"`
}
