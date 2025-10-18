package graphmodels

import (
	"context"
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/gofrs/uuid/v5"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Email        string    `gorm:"type:text;unique;not null"`
	PasswordHash string    `gorm:"type:text;not null"`
	Role         string    `gorm:"type:text;not null;default:'user'"`
	CreatedAt    time.Time `gorm:"default:now()"`
	UpdatedAt    time.Time `gorm:"default:now()"`
	DeletedAt    time.Time `gorm:"default:now()"`
}

// BeforeCreate ensures the user has an ID.
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		u.ID = id
	}
	return nil
}

// SetPassword hashes and sets the user's password.
func (u *User) SetPassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	return nil
}

// CheckPassword verifies a plaintext password matches the stored hash.
func (u *User) CheckPassword(password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) == nil
}

// IsAdmin returns true if the user has an admin role.
func (u *User) IsAdmin() bool {
	return u.Role == "admin"
}

// Save inserts or updates the user in the database.
func (u *User) Save(ctx context.Context, db *gorm.DB) error {
	if u.ID == uuid.Nil {
		return db.WithContext(ctx).Create(u).Error
	}
	return db.WithContext(ctx).Save(u).Error
}

// FindUserByEmail loads a user by email.
func FindUserByEmail(ctx context.Context, db *gorm.DB, email string) (*User, error) {
	var user User
	if err := db.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
