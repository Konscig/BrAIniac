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
	api "brainiac/gen"
	authapi "brainiac/gen/auth"
	"brainiac/models"
	"brainiac/models/graphmodels"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/joho/godotenv"
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

	godotenv.Load("../.env")

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

	err = db.AutoMigrate(
		&graphmodels.User{},
		&graphmodels.Agent{},
		&graphmodels.Dataset{},
		&graphmodels.Edge{},
		&graphmodels.Export{},
		&graphmodels.Metric{},
		&graphmodels.Node{},
		&graphmodels.Pipeline{},
		&graphmodels.PipelineVersion{},
		&graphmodels.Project{},
		&graphmodels.Run{},
		&graphmodels.RunTask{},
		&graphmodels.Tool{},
		&models.RefreshToken{},
	)
	if err != nil {
		panic("failed to auto migrate models")
	}

	jwtService := auth.NewJWTService(db, os.Getenv("JWT_SECRET_KEY"), time.Hour*24*30)
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(auth.InterceptorRouter(db, jwtService)))

	api.RegisterGreeterServer(grpcServer, &server{})
	authapi.RegisterAuthServiceServer(grpcServer, jwtService)

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
	err = authapi.RegisterAuthServiceHandlerFromEndpoint(ctx, mux, "localhost:50051", opts)
	if err != nil {
		log.Fatalf("failed to register AuthService gateway: %v", err)
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
