package auth

import (
	"os"
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
)

func TestGenerateAccessTokenAndRefreshToken(t *testing.T) {
	os.Setenv("SECRET_KEY", "testsecret")

	userID := uuid.Must(uuid.NewV4()).String()
	access, err := GenerateAccessToken(userID)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}
	if access == "" {
		t.Fatal("access token is empty")
	}

	exp := time.Now().Add(time.Hour).Unix()
	refresh, err := GenerateRefreshToken(userID, exp)
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}
	if refresh == "" {
		t.Fatal("refresh token is empty")
	}
}

func TestCheckToken(t *testing.T) {
	os.Setenv("SECRET_KEY", "testsecret")
	userID := uuid.Must(uuid.NewV4()).String()
	access, _ := GenerateAccessToken(userID)
	token, err := CheckToken(access, "access")
	if err != nil {
		t.Fatalf("CheckToken failed: %v", err)
	}
	if token == nil || !token.Valid {
		t.Fatal("token should be valid")
	}

	// Проверка неправильного типа
	_, err = CheckToken(access, "refresh")
	if err == nil {
		t.Fatal("expected error for wrong token type")
	}

	// Проверка истёкшего токена
	refresh, _ := GenerateRefreshToken(userID, time.Now().Add(-time.Hour).Unix())
	_, err = CheckToken(refresh, "refresh")
	if err == nil || err.Error() != "token expired" {
		t.Fatal("expected token expired error")
	}
}

func TestExtractSub(t *testing.T) {
	os.Setenv("SECRET_KEY", "testsecret")
	userID := uuid.Must(uuid.NewV4())
	access, _ := GenerateAccessToken(userID.String())
	token, _ := CheckToken(access, "access")

	sub, err := ExtractSub(token)
	if err != nil {
		t.Fatalf("ExtractSub failed: %v", err)
	}
	if sub != userID {
		t.Fatalf("expected %v, got %v", userID, sub)
	}

	// Токен nil
	_, err = ExtractSub(nil)
	if err == nil {
		t.Fatal("expected error for nil token")
	}
}

func TestGetIat(t *testing.T) {
	os.Setenv("SECRET_KEY", "testsecret")
	userID := uuid.Must(uuid.NewV4())
	access, _ := GenerateAccessToken(userID.String())
	token, _ := CheckToken(access, "access")

	iat, err := GetIat(token)
	if err != nil {
		t.Fatalf("GetIat failed: %v", err)
	}
	if time.Since(iat) > time.Minute {
		t.Fatalf("iat too far from now: %v", iat)
	}
}
