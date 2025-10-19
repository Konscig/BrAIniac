// // filepath: e:\diplik\BrAIniac\backend\server.go
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"brainiac/auth"
	"brainiac/auth/interceptors"
	api "brainiac/gen"
	"brainiac/models"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/rs/cors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type server struct {
	api.UnimplementedGreeterServer
}

func (s *server) SayHello(ctx context.Context, req *api.HelloRequest) (*api.HelloReply, error) {
	return &api.HelloReply{Message: "Hello, " + req.Name}, nil
}

func main() {
	// gRPC server
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	pg_user := os.Getenv("PG_USER")
	pg_password := os.Getenv("PG_PASSWORD")
	pg_db := os.Getenv("PG_DB")
	pg_port := os.Getenv("PG_PORT")
	pg_host := os.Getenv("PG_HOST")

	engine := models.Engine{
		Name:     "PostgreSQL",
		User:     pg_user,
		Password: pg_password,
		Database: pg_db,
		Uri:      fmt.Sprintf("%s:%s", pg_host, pg_port),
	}

	db, err := engine.CreateEngine()
	if err != nil {
		panic("failed to connect database")
	}

	jwtService := &auth.JWTService{
		db:              db,
		jwtSecretKey:    os.Getenv("JWT_SECRET_KEY"),
		refreshTokenTTL: 7 * 24 * time.Hour,
	}

	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			interceptors.DatabaseInterceptor(db),
			interceptors.CheckTokenInterceptor("access"),
			interceptors.NotRevokedTokenInterceptor(),
		),
	)
	api.RegisterGreeterServer(grpcServer, &server{})
	go func() {
		log.Println("Serving gRPC on :50051")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("failed to serve: %v", err)
		}
	}()

	// gRPC-Gateway
	ctx := context.Background()
	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	if err := api.RegisterGreeterHandlerFromEndpoint(ctx, mux, "localhost:50051", opts); err != nil {
		log.Fatalf("failed to start gateway: %v", err)
	}

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}).Handler(mux)

	log.Println("Serving gRPC-Gateway on :8080")
	if err := http.ListenAndServe(":8080", corsHandler); err != nil {
		log.Fatalf("failed to serve gateway: %v", err)
	}
}
