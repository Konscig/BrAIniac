package main

import (
	"context"
	"log"
	"net"
	"net/http"

	api "github.com/Konscig/BrAIniac/backend/gen"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
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
	grpcServer := grpc.NewServer()
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
	log.Println("Serving gRPC-Gateway on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("failed to serve gateway: %v", err)
	}
}
