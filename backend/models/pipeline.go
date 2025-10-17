package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type Pipeline struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID   Project         `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE"`
	Name        string          `gorm:"type:text;not null;unique"`
	LastVersion PipelineVersion `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:SET NULL"`
	CreatedAt   time.Time       `gorm:"default:now()"`
	UpdatedAt   time.Time       `gorm:"default:now()"`
	DeletedAt   time.Time       `gorm:"default:now()"`
}
