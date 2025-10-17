package models

import (
	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Node struct {
	gorm.Model
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VersionID  PipelineVersion `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:CASCADE"`
	Key        string          `gorm:"type:text;not null"`
	Type       string          `gorm:"type:text;not null"`
	ConfigJSON string          `gorm:"type:jsonb;not null"`
}
