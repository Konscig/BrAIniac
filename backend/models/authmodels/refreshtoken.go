package authmodels

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

type RefreshToken struct {
	ID        uint      `gorm:"primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	TokenHash string    `gorm:"type:text;not null"`
	UserAgent string    `gorm:"type:text"`
	IPAddress string    `gorm:"type:text"`
	CreatedAt time.Time `gorm:"default:now()"`
	UpdatedAt time.Time `gorm:"default:now()"`
	Expired   bool      `gorm:"default:false"`
}
