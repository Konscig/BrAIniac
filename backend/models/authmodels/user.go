package authmodels

import (
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type User struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Username        string    `gorm:"type:text;unique;not null"`
	PasswordHash    string    `gorm:"type:text;not null"`
	TokenValidAfter time.Time `gorm:"default:now()"`
	CreatedAt       time.Time `gorm:"default:now()"`
	UpdatedAt       time.Time `gorm:"default:now()"`
}

func (u *User) FindUserByUsername(engine *gorm.DB, username string) error {
	err := engine.Where("username = ?", username).First(&u).Error
	if err != nil {
		return err
	}
	return nil
}

func (u *User) InvalidateAccess(engine *gorm.DB, user *User) error {
	result := engine.Model(&u).Where("id = ?", user).Update("token_valid_after", time.Now())
	if result.Error != nil {
		return result.Error
	}
	return nil
}
