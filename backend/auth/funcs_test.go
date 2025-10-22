package auth

import (
	"context"
	"strings"
	"testing"

	"github.com/gofrs/uuid/v5"
	"google.golang.org/grpc/metadata"
)

func TestGenerateTokens(t *testing.T) {
	userID := uuid.Must(uuid.NewV4())
	access, refreshB64, refreshHash, err := GenerateTokens(userID)
	if err != nil {
		t.Fatalf("GenerateTokens failed: %v", err)
	}
	if access == "" || refreshB64 == "" || len(refreshHash) == 0 {
		t.Fatal("one of the tokens/hash is empty")
	}
}

func TestExtractBearerToken(t *testing.T) {
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer mytoken123",
	))

	token, err := ExtractBearerToken(ctx)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if token != "mytoken123" {
		t.Fatalf("expected 'mytoken123', got %s", token)
	}

	// Без metadata
	_, err = ExtractBearerToken(context.Background())
	if err == nil {
		t.Fatal("expected error for missing metadata")
	}

	// Неправильный префикс
	ctx = metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Token wrongprefix",
	))
	_, err = ExtractBearerToken(ctx)
	if err == nil || !strings.Contains(err.Error(), "invalid authorization header format") {
		t.Fatal("expected error for wrong prefix")
	}

	// Пустой токен
	ctx = metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer ",
	))
	_, err = ExtractBearerToken(ctx)
	if err == nil || !strings.Contains(err.Error(), "token is empty") {
		t.Fatal("expected error for empty token")
	}
}
