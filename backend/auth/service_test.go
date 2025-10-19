package auth_test

import (
	"context"
	"net"
	"testing"
	"time"

	"brainiac/auth"
	authpb "brainiac/gen/auth"
	"brainiac/models"
	"brainiac/models/authmodels"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/test/bufconn"
	"gorm.io/gorm"
)

const bufSize = 1024 * 1024

func setupTestDB(t *testing.T) *gorm.DB {
	// Создаем движок через твою структуру
	engine := models.Engine{
		Name:     "SQLite",
		User:     "", // не нужен для SQLite
		Password: "",
		Database: ":memory:", // in-memory база
		Uri:      "",
	}

	db, err := engine.CreateEngine()
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	// Автомиграция моделей
	if err := db.AutoMigrate(&authmodels.User{}, &authmodels.RefreshToken{}); err != nil {
		t.Fatalf("failed to auto migrate models: %v", err)
	}

	return db
}

func setupTestGRPCServer(t *testing.T, db *gorm.DB) (*grpc.ClientConn, func()) {
	listener := bufconn.Listen(bufSize)
	s := grpc.NewServer()
	jwtService := auth.NewJWTService(db, "test-secret", time.Hour)
	authpb.RegisterAuthServiceServer(s, jwtService)

	go func() {
		err := s.Serve(listener)
		require.NoError(t, err)
	}()

	ctx := context.Background()
	conn, err := grpc.DialContext(
		ctx,
		"bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithInsecure(),
	)
	require.NoError(t, err)

	return conn, func() {
		conn.Close()
		s.Stop()
	}
}

func TestSignin(t *testing.T) {
	db := setupTestDB(t)
	conn, cleanup := setupTestGRPCServer(t, db)
	defer cleanup()

	client := authpb.NewAuthServiceClient(conn)

	req := &authpb.SigninRequest{
		Username: "testuser",
		Email:    "test@example.com",
		Password: "password123",
	}

	resp, err := client.Signin(context.Background(), req)
	require.NoError(t, err)
	require.NotEmpty(t, resp.AccessToken)
	require.NotEmpty(t, resp.RefreshToken)

	// Проверяем, что пользователь реально создан
	var user authmodels.User
	err = db.Where("username = ?", "testuser").First(&user).Error
	require.NoError(t, err)
}

func TestLogin(t *testing.T) {
	db := setupTestDB(t)

	// Создаем пользователя через модель
	passwordHash, _ := authmodels.HashPassword("password123")
	authmodels.CreateUser(db, "test@example.com", "testuser", passwordHash)

	conn, cleanup := setupTestGRPCServer(t, db)
	defer cleanup()
	client := authpb.NewAuthServiceClient(conn)

	req := &authpb.LoginRequest{
		Username: "testuser",
		Password: "password123",
	}

	resp, err := client.Login(context.Background(), req)
	require.NoError(t, err)
	require.NotEmpty(t, resp.AccessToken)
	require.NotEmpty(t, resp.RefreshToken)
}

func TestRefreshToken(t *testing.T) {
	db := setupTestDB(t)

	// Создаем пользователя и refresh токен
	passwordHash, _ := authmodels.HashPassword("password123")
	user := authmodels.CreateUser(db, "test@example.com", "testuser", passwordHash)

	accessToken, refreshTokenB64, refreshHash, _ := auth.GenerateTokens(user.ID)
	rt := authmodels.RefreshToken{
		UserID:    user.ID,
		TokenHash: string(refreshHash),
	}
	rt.CreateToken(db)

	conn, cleanup := setupTestGRPCServer(t, db)
	defer cleanup()
	client := authpb.NewAuthServiceClient(conn)

	ctx := context.WithValue(context.Background(), "spottedToken", &rt)
	req := &authpb.RefreshTokenRequest{
		RefreshToken: refreshTokenB64,
	}

	resp, err := client.RefreshToken(ctx, req)
	require.NoError(t, err)
	require.NotEmpty(t, resp.AccessToken)
	require.NotEmpty(t, resp.RefreshToken)
}

func TestLogout(t *testing.T) {
	db := setupTestDB(t)

	passwordHash, _ := authmodels.HashPassword("password123")
	user := authmodels.CreateUser(db, "test@example.com", "testuser", passwordHash)

	conn, cleanup := setupTestGRPCServer(t, db)
	defer cleanup()
	client := authpb.NewAuthServiceClient(conn)

	ctx := context.Background()
	ctx = context.WithValue(ctx, "db", db)
	ctx = context.WithValue(ctx, "tokenType", "access")
	ctx = context.WithValue(ctx, "userid", user.ID)
	ctx = context.WithValue(ctx, "user", user)

	req := &authpb.LogoutRequest{}

	resp, err := client.Logout(ctx, req)
	require.NoError(t, err)
	require.True(t, resp.Success)
}
