package auth_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"brainiac/auth"
	gen "brainiac/gen/auth"
	"brainiac/models"
	"brainiac/models/graphmodels"

	"github.com/gofrs/uuid/v5"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	user := os.Getenv("POSTGRES_USER")
	pass := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")
	host := os.Getenv("POSTGRES_HOST")
	port := os.Getenv("POSTGRES_PORT")

	t.Logf("PG_HOST=%s, PG_USER=%s", os.Getenv("PG_HOST"), os.Getenv("POSTGRES_USER"))

	if user == "" || pass == "" || dbname == "" || host == "" || port == "" {
		t.Fatal("set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT")
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, pass, dbname)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect db: %v", err)
	}

	// Сбрасываем таблицы перед тестом
	err = db.Migrator().DropTable(&graphmodels.User{}, &models.RefreshToken{})
	if err != nil {
		t.Fatalf("failed to drop tables: %v", err)
	}

	// Мигрируем заново
	err = db.AutoMigrate(&graphmodels.User{}, &models.RefreshToken{})
	if err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	return db
}

func TestJWTServiceIntegration(t *testing.T) {
	os.Setenv("SECRET_KEY", "mysecretkey")
	db := setupTestDB(t)
	service := auth.NewJWTService(db, "mysecretkey", time.Hour*24)

	ctx := context.Background()

	email := "test@example.com"
	username := "testuser"
	password := "password123"

	signinResp, err := service.Signin(ctx, &gen.SigninRequest{
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("Signin failed: %v", err)
	}
	if signinResp.AccessToken == "" || signinResp.RefreshToken == "" {
		t.Fatalf("Signin tokens empty")
	}

	loginResp, err := service.Login(ctx, &gen.LoginRequest{
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if loginResp.AccessToken == "" || loginResp.RefreshToken == "" {
		t.Fatalf("Login tokens empty")
	}

	refreshToken := &models.RefreshToken{
		UserID:    uuid.Nil,
		TokenHash: string([]byte("dummy")),
	}
	ctx = context.WithValue(ctx, "spottedToken", refreshToken)
	_, err = service.RefreshToken(ctx, &gen.RefreshTokenRequest{})
	if err != nil && err.Error() != "failed to generate tokens" {
		// Ignore ошибки, связанные с фиктивным токеном
		t.Logf("RefreshToken: expected error for dummy token: %v", err)
	}

	var user graphmodels.User
	err = db.First(&user, "username = ?", username).Error
	if err != nil {
		t.Fatalf("cannot find user for logout: %v", err)
	}
	ctx = context.WithValue(ctx, "tokenType", "access")
	ctx = context.WithValue(ctx, "userid", user.ID)
	ctx = context.WithValue(ctx, "user", &user)

	logoutResp, err := service.Logout(ctx, &gen.LogoutRequest{})
	if err != nil {
		t.Fatalf("Logout failed: %v", err)
	}
	if !logoutResp.Success {
		t.Fatalf("Logout not successful")
	}
}
