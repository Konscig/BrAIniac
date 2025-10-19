package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/gofrs/uuid/v5"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/metadata"
)

// GenerateTokens создает пару access и refresh токенов для пользователя с заданным userID.
//
// Формирует access токен, refresh токен, кодирует refresh в base64,
// хэширует sha256 и bcrypt для безопасного хранения в базе.
//
// Параметры:
//   - userID: идентификатор пользователя, для которого создаются токены.
//
// Возвращает:
//   - accessToken: строка JWT access токена,
//   - refreshTokenB64: строка base64-кодированного refresh токена,
//   - refreshHash: bcrypt-хэш sha256-образа refresh токена,
//   - err: ошибка, если что-то пошло не так.
func GenerateTokens(userID uuid.UUID) (string, string, []byte, error) {

	accessToken, err := GenerateAccessToken(userID.String())
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to create access token: %v", err)
	}
	refreshToken, err := GenerateRefreshToken(userID.String(), time.Now().Add(time.Hour*24*30).Unix())
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to create refresh token: %v", err)
	}

	b64Token := base64.StdEncoding.EncodeToString([]byte(refreshToken))
	shaToken := sha256.Sum256([]byte(b64Token))
	refreshHash, err := bcrypt.GenerateFromPassword([]byte(shaToken[:]), bcrypt.DefaultCost)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to hash refresh token: %v", err)
	}

	return accessToken, b64Token, refreshHash, nil
}

// ExtractBearerToken извлекает Bearer токен из заголовка Authorization HTTP запроса.
//
// Параметры:
//   - ctx - контекст запроса;
//
// Возвращает:
//   - строку токена (без префикса "Bearer ").
//   - ошибку, если заголовок отсутствует или формат неверный.
func ExtractBearerToken(ctx context.Context) (string, error) {
	meta, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return "", fmt.Errorf("missing metadata in context")
	}

	authHeaders := meta.Get("authorization")
	if len(authHeaders) == 0 {
		return "", fmt.Errorf("authorization header is missing")
	}

	authHeader := authHeaders[0]
	const prefix = "Bearer "

	if !strings.HasPrefix(authHeader, prefix) {
		return "", fmt.Errorf("invalid authorization header format (expected 'Bearer <token>')")
	}

	token := strings.TrimPrefix(authHeader, prefix)
	if token == "" {
		return "", fmt.Errorf("token is empty")
	}

	return token, nil
}
