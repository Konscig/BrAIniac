package graphmodels

import (
	"context"
	"time"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type User struct {
	ID              uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Email           string         `gorm:"type:text;unique;not null"`
	Username        string         `gorm:"type:text;unique;not null"`
	PasswordHash    string         `gorm:"type:text;not null"`
	Role            string         `gorm:"type:text;not null;default:'user'"`
	TokenValidAfter time.Time      `gorm:"default:now()"`
	CreatedAt       time.Time      `gorm:"autoCreateTime"`
	UpdatedAt       time.Time      `gorm:"autoUpdateTime"`
	DeletedAt       gorm.DeletedAt `gorm:"index"`
}

func (u *User) CreateUser(db *gorm.DB, email string, username string, passwordHash string) (*User, error) {
	u.ID = uuid.Must(uuid.NewV4())
	u.Email = email
	u.Username = username
	u.PasswordHash = passwordHash
	u.TokenValidAfter = time.Now()

	if err := db.Create(u).Error; err != nil {
		return nil, err
	}

	return u, nil
}

func FindUserByEmail(ctx context.Context, db *gorm.DB, email string) (*User, error) {
	var user User
	if err := db.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (u *User) FindUserByUsername(engine *gorm.DB, username string) error {
	err := engine.Where("username = ?", username).First(&u).Error
	if err != nil {
		return err
	}
	return nil
}

func (u *User) InvalidateAccess(engine *gorm.DB) error {
	result := engine.Model(u).Where("id = ?", u.ID).Update("token_valid_after", time.Now())
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func (u *User) LoadByID(db *gorm.DB, id uuid.UUID) error {
	result := db.Where("id = ?", id).First(u)
	return result.Error
}
