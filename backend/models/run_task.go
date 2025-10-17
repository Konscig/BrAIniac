package models

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type RunTask struct {
	gorm.Model
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	RunID      Run       `gorm:"foreignKey:RunID;constraint:OnDelete:CASCADE"`
	NodeID     Node      `gorm:"foreignKey:NodeID;constraint:OnDelete:CASCADE"`
	Worker     string    `gorm:"type:text;not null"`
	Status     string    `gorm:"type:text;not null"`
	Attempt    int       `gorm:"not null"`
	Metric     Metric    `gorm:"foreignKey:RunID;constraint:OnDelete:CASCADE"`
	LogsUri    string    `gorm:"type:text;not null"`
	OutputJSON string    `gorm:"type:jsonb;not null"`
	CreatedAt  time.Time `gorm:"default:now()"`
	UpdatedAt  time.Time `gorm:"default:now()"`
	DeletedAt  time.Time `gorm:"default:now()"`
}
