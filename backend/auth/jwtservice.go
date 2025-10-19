package auth

import (
	"context"
	"time"

	"brainiac/gen/auth"
	"brainiac/models/authmodels"

	"github.com/gofrs/uuid/v5"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/metadata"
	"gorm.io/gorm"
)

type JWTService struct {
	auth.UnimplementedAuthServiceServer
	db              *gorm.DB
	user            authmodels.User
	jwtSecretKey    string
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

func (s *JWTService) Login(ctx context.Context, req *auth.LoginRequest) (*auth.LoginReply, error) {
	var db *gorm.DB
	var userAgent string
	var ipAddr string

	db = s.db
	if meta, ok := metadata.FromIncomingContext(ctx); ok {
		if ua := meta.Get("user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		}
		if ip := meta.Get("x-forwarded-for"); len(ip) > 0 {
			ipAddr = ip[0]
		}
	}

	password := []byte(req.Password)
	var user authmodels.User
	err := user.FindUserByUsername(db, req.Username)
	if err != nil {
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), password)
	if err != nil {
		return nil, err
	}

	accessToken, refreshTokenB64, refreshHash, err := generateTokens(user.ID)
	if err != nil {
		return nil, err
	}

	newRefreshToken := authmodels.RefreshToken{
		UserID:    user.ID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	result, err := newRefreshToken.CreateToken(db)
	if err != nil || !result {
		return nil, err
	}

	return &auth.LoginReply{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenB64,
	}, nil
}

func (s *JWTService) RefreshToken(ctx context.Context, req *auth.RefreshTokenRequest) (*auth.RefreshTokenReply, error) {
	var db *gorm.DB
	var userAgent string
	var ipAddr string

	db = s.db

	tokenValue := ctx.Value("spottedToken")
	oldRefreshToken, ok := tokenValue.(*authmodels.RefreshToken)
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

	err := oldRefreshToken.InvalidateToken(db)
	if err != nil {
		return nil, err
	}

	accessToken, refreshTokenB64, refreshHash, err := generateTokens(oldRefreshToken.UserID)
	if err != nil {
		return nil, err
	}

	newRefreshToken := authmodels.RefreshToken{
		UserID:    oldRefreshToken.UserID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	_, err = newRefreshToken.CreateToken(db)
	if err != nil {
		return nil, err
	}
	return &auth.RefreshTokenReply{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenB64,
	}, nil
}

func (s *JWTService) Logout(ctx context.Context, req *auth.LogoutRequest) (*auth.LogoutReply, error) {
	var db *gorm.DB
	db = s.db

	tokenType, ok := ctx.Value("tokenType").(string)
	if !ok || tokenType != "access" {
		return &auth.LogoutReply{Success: false}, nil
	}

	sub, ok := ctx.Value("userid").(uuid.UUID)
	if !ok {
		return &auth.LogoutReply{Success: false}, nil
	}

	user, ok := ctx.Value("user").(*authmodels.User)
	if !ok {
		return &auth.LogoutReply{Success: false}, nil
	}

	err := user.InvalidateAccess(db, user)
	if err != nil {
		return &auth.LogoutReply{Success: false}, nil
	}

	err = (&authmodels.RefreshToken{}).DeleteRefreshToken(db, sub)
	if err != nil {
		return &auth.LogoutReply{Success: false}, nil
	}

	return &auth.LogoutReply{Success: true}, nil
}
