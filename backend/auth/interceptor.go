package auth

import (
	"brainiac/models/authmodels"
	"strings"

	"context"
	"crypto/sha256"
	"encoding/base64"

	"github.com/gofrs/uuid/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

func DatabaseInterceptor(db *gorm.DB) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		newCtx := context.WithValue(ctx, "db", db)
		return handler(newCtx, req)
	}
}

func CheckTokenInterceptor(tokenType string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {

		db, ok := ctx.Value("db").(*gorm.DB)
		if !ok {
			return nil, status.Error(codes.Internal, "DB connection not found")
		}

		bearerToken, err := ExtractBearerToken(ctx)

		var token *jwt.Token
		var sub uuid.UUID
		var spottedToken *authmodels.RefreshToken

		if tokenType == "refresh" {
			clearToken, err := base64.StdEncoding.DecodeString(bearerToken)
			if err != nil {
				return nil, status.Error(codes.Unauthenticated, "token decoding error")
			}

			token, err = CheckToken(string(clearToken), tokenType)
			if err != nil {
				return nil, status.Error(codes.Unauthenticated, "failed to check token")
			}

			sub, err = ExtractSub(token)
			if err != nil {
				return nil, status.Error(codes.Unauthenticated, "failed to extract sub")
			}

			var refreshTokens []authmodels.RefreshToken
			if err = db.Where("user_id = ? AND expired = false", sub).Find(&refreshTokens).Error; err != nil {
				return nil, status.Error(codes.Unauthenticated, "failed to find refresh tokens")
			}

			shaToken := sha256.Sum256([]byte(bearerToken))
			for i := range refreshTokens {
				err = bcrypt.CompareHashAndPassword([]byte(refreshTokens[i].TokenHash), shaToken[:])
				if err == nil {
					spottedToken = &refreshTokens[i]
					break
				}
			}
			if spottedToken == nil {
				return nil, status.Error(codes.Unauthenticated, "refresh token not found in DB")
			}

		} else if tokenType == "access" {
			token, err = CheckToken(bearerToken, tokenType)
			if err != nil {
				return nil, status.Error(codes.Unauthenticated, "invalid access token")
			}

			sub, err = ExtractSub(token)
			if err != nil {
				return nil, status.Error(codes.Unauthenticated, "failed to extract sub")
			}
		} else {
			return nil, status.Error(codes.Unauthenticated, "unauthorized")
		}

		// Передаем данные в контекст
		newCtx := context.WithValue(ctx, "userid", sub)
		newCtx = context.WithValue(newCtx, "tokenType", tokenType)
		if spottedToken != nil {
			newCtx = context.WithValue(newCtx, "spottedToken", spottedToken)
		}

		return handler(newCtx, req)
	}
}

func NotRevokedTokenInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		db, ok := ctx.Value("db").(*gorm.DB)
		if !ok {
			return nil, status.Error(codes.Internal, "DB connection not found")
		}

		bearerToken, err := ExtractBearerToken(ctx)

		token, err := CheckToken(bearerToken, "access")
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		sub, err := ExtractSub(token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		iat, err := GetIat(token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		var user authmodels.User
		if err := db.Where("id = ?", sub).First(&user).Error; err != nil {
			return nil, status.Error(codes.Unauthenticated, "user not found")
		}

		if iat.Before(user.TokenValidAfter) {
			return nil, status.Error(codes.Unauthenticated, "token has been revoked")
		}

		newCtx := context.WithValue(ctx, "user", &user)
		return handler(newCtx, req)
	}
}

func InterceptorRouter(db *gorm.DB, jwtService *JWTService) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {

		method := info.FullMethod

		// Всегда добавляем базу данных в контекст
		ctx = context.WithValue(ctx, "db", db)

		switch {
		case strings.HasSuffix(method, "Login"):
			return handler(ctx, req)

		case strings.HasSuffix(method, "RefreshToken"):
			checkInterceptor := CheckTokenInterceptor("refresh")
			return checkInterceptor(ctx, req, info, handler)

		case strings.HasSuffix(method, "Logout"):
			checkInterceptor := CheckTokenInterceptor("access")
			notRevoked := NotRevokedTokenInterceptor()

			return checkInterceptor(ctx, req, info, func(c context.Context, r interface{}) (interface{}, error) {
				return notRevoked(c, r, info, handler)
			})

		default:
			return handler(ctx, req)
		}
	}
}
