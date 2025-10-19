package authmodels

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
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

func (t *RefreshToken) CreateToken(engine *gorm.DB) (bool, error) {
	result := engine.Create(&t)
	if result.Error != nil {
		return false, result.Error
	}
	return true, nil
}

func (t *RefreshToken) InvalidateToken(engine *gorm.DB) error {
	result := engine.Model(&t).Update("expired", true)
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func (t *RefreshToken) DeleteRefreshToken(engine *gorm.DB, userid uuid.UUID) error {
	result := engine.Where("user_id = ?", userid).Delete(&t)
	if result.Error != nil {
		return result.Error
	}
	return nil
}
