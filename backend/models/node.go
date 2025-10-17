package models

import (
	"context"

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

func (n *Node) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		n.ID = id
	}
	return nil
}

func (n *Node) Save(ctx context.Context, db *gorm.DB) error {
	if n.ID == uuid.Nil {
		return db.WithContext(ctx).Create(n).Error
	}
	return db.WithContext(ctx).Save(n).Error
}
