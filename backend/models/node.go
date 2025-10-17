package models

import (
	"github.com/gofrs/uuid/v5"
)

type Node struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VersionID  PipelineVersion `gorm:"foreignKey:PipelineVersionID;constraint:OnDelete:CASCADE"`
	Key        string          `gorm:"type:text;not null"`
	Type       string          `gorm:"type:text;not null"`
	ConfigJSON string          `gorm:"type:jsonb;not null"`
}
