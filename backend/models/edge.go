package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Edge struct {
	gorm.Model
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VersionID uuid.UUID `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:CASCADE"`
	FromNode  Node      `gorm:"foreignKey:VersionID,FromKey;references:VersionID,Key;unique"`
	ToNode    Node      `gorm:"foreignKey:VersionID,ToKey;references:VersionID,Key;unique"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	DeletedAt time.Time `gorm:"default:now()"`
}
