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
	"brainiac/graph"
	"brainiac/models"
	"brainiac/models/graphmodels"
	project "brainiac/projects"

	emptypb "google.golang.org/protobuf/types/known/emptypb"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type server struct {
	api.UnimplementedGreeterServer
}

// CombinedService exposes AgentGraphService by embedding the graph service and
// delegating project-specific RPCs to the projects service implementation.
type CombinedService struct {
	*graph.Service
	proj *project.Service
}

// Delegate project RPCs to proj
func (c *CombinedService) CreateProjectWithOwner(ctx context.Context, req *api.CreateProjectRequest) (*api.ProjectResponse, error) {
	return c.proj.CreateProjectWithOwner(ctx, req)
}

func (c *CombinedService) GetProject(ctx context.Context, req *api.GetProjectRequest) (*api.ProjectResponse, error) {
	return c.proj.GetProject(ctx, req)
}

func (c *CombinedService) ListProjects(ctx context.Context, req *emptypb.Empty) (*api.ListProjectsResponse, error) {
	return c.proj.ListProjects(ctx, req)
}

func (c *CombinedService) UpdateProject(ctx context.Context, req *api.UpdateProjectRequest) (*api.ProjectResponse, error) {
	return c.proj.UpdateProject(ctx, req)
}

func (c *CombinedService) DeleteProject(ctx context.Context, req *api.DeleteProjectRequest) (*emptypb.Empty, error) {
	return c.proj.DeleteProject(ctx, req)
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
		&graphmodels.Document{},
		&graphmodels.Run{},
		&graphmodels.RunTask{},
		&graphmodels.Tool{},
		&models.RefreshToken{},
	)
	if err != nil {
		panic("failed to auto migrate models")
	}

	jwtService := auth.NewJWTService(db, os.Getenv("JWT_SECRET_KEY"), time.Hour*24*30)
	mistralKey := os.Getenv("MISTRAL_API_KEY")
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(auth.InterceptorRouter(db, jwtService)))

	api.RegisterGreeterServer(grpcServer, &server{})
	authapi.RegisterAuthServiceServer(grpcServer, jwtService)

	// Create graph and project service implementations and expose them via a combined
	// AgentGraphService implementation so the new projects CRUD endpoints from the
	// PR are available alongside the existing graph RPCs.
	graphSvc := graph.NewService(db, mistralKey)
	projSvc := project.NewService(db)
	combined := &CombinedService{Service: graphSvc, proj: projSvc}
	api.RegisterAgentGraphServiceServer(grpcServer, combined)

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
	if err := authapi.RegisterAuthServiceHandlerFromEndpoint(ctx, mux, "localhost:50051", opts); err != nil {
		log.Fatalf("failed to register AuthService gateway: %v", err)
	}
	if err := api.RegisterAgentGraphServiceHandlerFromEndpoint(ctx, mux, "localhost:50051", opts); err != nil {
		log.Fatalf("failed to register AgentGraphService gateway: %v", err)
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
