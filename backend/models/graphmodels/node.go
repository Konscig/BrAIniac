package graphmodels

import (
	"context"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type Node struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VersionID  uuid.UUID `gorm:"type:uuid;not null;index"`
	Key        string    `gorm:"type:text;not null"`
	Label      string    `gorm:"type:text;not null"`
	Category   string    `gorm:"type:text;not null"`
	Type       string    `gorm:"type:text;not null"`
	Status     string    `gorm:"type:text;not null;default:'idle'"`
	PositionX  float64   `gorm:"type:double precision;not null;default:0"`
	PositionY  float64   `gorm:"type:double precision;not null;default:0"`
	ConfigJSON string    `gorm:"type:jsonb;not null;default:'{}'"`
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

// UpdateFields allows updating selected node fields in a single call.
func (n *Node) UpdateFields(ctx context.Context, db *gorm.DB, fields map[string]interface{}) error {
	return db.WithContext(ctx).Model(n).Updates(fields).Error
}
