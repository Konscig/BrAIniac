package interceptors

import (
	"context"

	"google.golang.org/grpc"
	"gorm.io/gorm"
)

func DatabaseInterceptor(db *gorm.DB) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		newCtx := context.WithValue(ctx, "db", db)
		return handler(newCtx, req)
	}
}
