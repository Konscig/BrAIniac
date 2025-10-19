package auth

import (
	"context"
	"time"

	"brainiac/gen/auth"
	"brainiac/models"
	"brainiac/models/graphmodels"

	"github.com/gofrs/uuid/v5"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type JWTService struct {
	auth.UnimplementedAuthServiceServer
	db              *gorm.DB
	jwtSecretKey    string
	refreshTokenTTL time.Duration
}

func NewJWTService(db *gorm.DB, jwtSecretKey string, refreshTokenTTL time.Duration) *JWTService {
	return &JWTService{
		db:              db,
		jwtSecretKey:    jwtSecretKey,
		refreshTokenTTL: refreshTokenTTL,
	}
}

func (s *JWTService) Signin(ctx context.Context, req *auth.SigninRequest) (*auth.LoginReply, error) {
	var db *gorm.DB
	var userAgent, ipAddr string

	db = s.db

	if meta, ok := metadata.FromIncomingContext(ctx); ok {
		if ua := meta.Get("user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		}
		if ip := meta.Get("x-forwarded-for"); len(ip) > 0 {
			ipAddr = ip[0]
		}
	}

	// Хэшируем пароль
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to hash password")
	}

	// Создаём пользователя через метод структуры
	user := &graphmodels.User{}
	newUser, err := user.CreateUser(db, req.Email, req.Username, string(hashedPassword))
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to create user")
	}

	// Генерируем токены
	accessToken, refreshTokenB64, refreshHash, err := GenerateTokens(newUser.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to generate tokens")
	}

	// Сохраняем refresh токен
	newRefreshToken := models.RefreshToken{
		UserID:    newUser.ID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	if _, err := newRefreshToken.CreateToken(db); err != nil {
		return nil, status.Error(codes.Internal, "failed to save refresh token")
	}

	// Возвращаем токены
	return &auth.LoginReply{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenB64,
	}, nil
}

func (s *JWTService) Login(ctx context.Context, req *auth.LoginRequest) (*auth.LoginReply, error) {
	var userAgent string
	var ipAddr string

	if meta, ok := metadata.FromIncomingContext(ctx); ok {
		if ua := meta.Get("user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		}
		if ip := meta.Get("x-forwarded-for"); len(ip) > 0 {
			ipAddr = ip[0]
		}
	}

	password := []byte(req.Password)
	var user graphmodels.User
	err := user.FindUserByUsername(s.db, req.Username)
	if err != nil {
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), password)
	if err != nil {
		return nil, err
	}

	accessToken, refreshTokenB64, refreshHash, err := GenerateTokens(user.ID)
	if err != nil {
		return nil, err
	}

	newRefreshToken := models.RefreshToken{
		UserID:    user.ID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	result, err := newRefreshToken.CreateToken(s.db)
	if err != nil || !result {
		return nil, err
	}

	return &auth.LoginReply{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenB64,
	}, nil
}

func (s *JWTService) RefreshToken(ctx context.Context, req *auth.RefreshTokenRequest) (*auth.RefreshTokenReply, error) {
	var userAgent string
	var ipAddr string

	tokenValue := ctx.Value("spottedToken")
	oldRefreshToken, ok := tokenValue.(*models.RefreshToken)
	if !ok {
		return nil, nil
	}

	if meta, ok := metadata.FromIncomingContext(ctx); ok {
		if ua := meta.Get("user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		}
		if ip := meta.Get("x-forwarded-for"); len(ip) > 0 {
			ipAddr = ip[0]
		}
	}

	err := oldRefreshToken.InvalidateToken(s.db)
	if err != nil {
		return nil, err
	}

	accessToken, refreshTokenB64, refreshHash, err := GenerateTokens(oldRefreshToken.UserID)
	if err != nil {
		return nil, err
	}

	newRefreshToken := models.RefreshToken{
		UserID:    oldRefreshToken.UserID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	_, err = newRefreshToken.CreateToken(s.db)
	if err != nil {
		return nil, err
	}
	return &auth.RefreshTokenReply{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenB64,
	}, nil
}

func (s *JWTService) Logout(ctx context.Context, req *auth.LogoutRequest) (*auth.LogoutReply, error) {
	tokenType, ok := ctx.Value("tokenType").(string)
	if !ok || tokenType != "access" {
		return &auth.LogoutReply{Success: false}, nil
	}

	sub, ok := ctx.Value("userid").(uuid.UUID)
	if !ok {
		return &auth.LogoutReply{Success: false}, nil
	}

	user, ok := ctx.Value("user").(*graphmodels.User)
	if !ok {
		return &auth.LogoutReply{Success: false}, nil
	}

	// Обновляем token_valid_after
	err := user.InvalidateAccess(s.db)
	if err != nil {
		return &auth.LogoutReply{Success: false}, nil
	}

	// Удаляем все refresh токены
	err = (&models.RefreshToken{}).DeleteRefreshToken(s.db, sub)
	if err != nil {
		return &auth.LogoutReply{Success: false}, nil
	}

	return &auth.LogoutReply{Success: true}, nil
}
