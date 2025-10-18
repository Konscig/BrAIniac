package main

import (
	"fmt"
	"os"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/golang-jwt/jwt/v5"
)

// generateAccessToken генерирует JWT access токен доступа для указанного пользователя.
//
// Параметры:
//   - userID: идентификатор пользователя (UUID).
//
// Возвращает:
//   - string: сгенерированный JWT access токен.
//   - error: ошибка, если токен не удалось сгенерировать.
func generateAccessToken(userID string) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{
		"sub":  userID,
		"exp":  time.Now().Add(time.Minute * 15).Unix(),
		"type": "access",
		"iat":  time.Now().Unix(),
	}).SignedString([]byte(os.Getenv("SECRET_KEY")))
}

// generateRefreshToken генерирует JWT refresh токен доступа для указанного пользователя.
//
// Параметры:
//   - userID: идентификатор пользователя (UUID).
//
// Возвращает:
//   - string: сгенерированный JWT refresh токен.
//   - error: ошибка, если токен не удалось сгенерировать.
func generateRefreshToken(userID string, exp int64) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{
		"sub":  userID,
		"exp":  exp,
		"type": "refresh",
		"iat":  time.Now().Unix(),
	}).SignedString([]byte(os.Getenv("SECRET_KEY")))
}

// checkToken проверяет валидность токена и его тип.
//
// Параметры:
//   - tokenString: строка токена.
//   - tokenType: ожидаемый тип токена (например, "access" или "refresh").
//
// Возвращает:
//   - *jwt.Token: объект токена, если токен валиден.
//   - error: ошибка, если токен не валиден или имеет неверный тип.
func checkToken(tokenString string, tokenType string) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(os.Getenv("SECRET_KEY")), nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to parse token")
	}
	if token.Valid && tokenType != "" && token != nil {
		claims, _ := token.Claims.(jwt.MapClaims)
		exactType := claims["type"].(string)
		if exactType != tokenType {
			return nil, fmt.Errorf("invalid token type")
		}
		exp, err := claims.GetExpirationTime()
		if err != nil {
			return nil, fmt.Errorf("no exp time")
		}
		if time.Now().After(exp.Time) {
			return nil, fmt.Errorf("token expired")
		}
	}
	return token, err
}

// extractSub извлекает идентификатор пользователя из токена.
//
// Параметры:
//   - token: объект токена.
//
// Возвращает:
//   - uuid.UUID: идентификатор пользователя.
//   - error: ошибка, если идентификатор пользователя не найден.
func extractSub(token *jwt.Token) (uuid.UUID, error) {
	if token == nil {
		return uuid.Nil, fmt.Errorf("token is nil")
	}
	sub, exists := token.Claims.(jwt.MapClaims)["sub"].(string)
	if !exists {
		return uuid.Nil, fmt.Errorf("sub claim not found")
	}
	subUUID, err := uuid.FromString(sub)
	if err != nil {
		return uuid.Nil, fmt.Errorf("uuid parse error")
	}
	return subUUID, nil
}

// getIat извлекает время создания токена из токена.
//
// Параметры:
//   - token: объект токена.
//
// Возвращает:
//   - time.Time: время создания токена.
func getIat(token *jwt.Token) (time.Time, error) {
	iat, exists := token.Claims.(jwt.MapClaims)["iat"].(float64)
	if !exists {
		return time.Time{}, fmt.Errorf("iat claim not found")
	}
	return time.Unix(int64(iat), 0), nil
}
