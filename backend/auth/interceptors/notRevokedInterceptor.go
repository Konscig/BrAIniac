package interceptors

import (
	"brainiac/auth"
	"brainiac/models/authmodels"
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

func NotRevokedTokenInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		db, ok := ctx.Value("db").(*gorm.DB)
		if !ok {
			return nil, status.Error(codes.Internal, "DB connection not found")
		}

		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		bearerToken := ""
		if t := md.Get("authorization"); len(t) > 0 {
			bearerToken = t[0]
		} else {
			return nil, status.Error(codes.Unauthenticated, "missing token")
		}

		token, err := auth.CheckToken(bearerToken, "access")
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		sub, err := auth.ExtractSub(token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		iat, err := auth.GetIat(token)
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
