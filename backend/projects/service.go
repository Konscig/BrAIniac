package project

import (
	api "brainiac/gen"
	"brainiac/models/graphmodels"
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofrs/uuid/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	emptypb "google.golang.org/protobuf/types/known/emptypb"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Service struct {
	api.UnimplementedAgentGraphServiceServer
	db *gorm.DB
}

func NewService(engine *gorm.DB) *Service {
	return &Service{db: engine}
}

func sanitizeJSON(raw string) (datatypes.JSON, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return datatypes.JSON([]byte("{}")), nil
	}

	var tmp interface{}
	if err := json.Unmarshal([]byte(trimmed), &tmp); err != nil {
		return nil, err
	}

	cleaned, err := json.Marshal(tmp)
	if err != nil {
		return nil, err
	}

	return datatypes.JSON(cleaned), nil
}

// CreateProjectWithOwner handles project creation when owner_id and config_json may be provided.
func (s *Service) CreateProjectWithOwner(ctx context.Context, req *api.CreateProjectRequest) (*api.ProjectResponse, error) {
	if req.GetName() == "" {
		return nil, status.Error(codes.InvalidArgument, "Project name is needed!")
	}

	userID, err := uuid.FromString(req.GetOwnerId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid owner ID: %v", err)
	}

	cfg := datatypes.JSON([]byte("{}"))
	if req.GetConfigJson() != "" {
		cleaned, err := sanitizeJSON(req.GetConfigJson())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid config JSON: %v", err)
		}
		cfg = datatypes.JSON(cleaned)
	}

	project := &graphmodels.Project{}
	if err := project.CreateProject(s.db, userID, req.GetName(), req.GetDescription(), cfg); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create project: %v", err)
	}

	resp := &api.ProjectResponse{
		Id:          project.ID.String(),
		Name:        project.Name,
		Description: project.Description,
		ConfigJson:  string(project.Config)}

	return resp, nil
}

func (s *Service) GetProject(ctx context.Context, req *api.GetProjectRequest) (*api.ProjectResponse, error) {
	projectID, err := uuid.FromString(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}
	project, err := graphmodels.GetProjectByID(s.db, projectID)

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Error(codes.NotFound, "project not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to load project: %v", err)
	}

	resp := &api.ProjectResponse{
		Id:          project.ID.String(),
		Name:        project.Name,
		Description: project.Description,
		ConfigJson:  string(project.Config)}

	return resp, nil
}

func (s *Service) ListProjects(ctx context.Context, _ *api.ListProjectsRequest) (*api.ListProjectsResponse, error) {
	// Тут можно брать userID из ctx или gRPC metadata
	var userID uuid.UUID // получаем от фронта/токена
	projects, err := graphmodels.ShowAllProjects(s.db, userID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list projects: %v", err)
	}

	resp := &api.ListProjectsResponse{Projects: make([]*api.ProjectSummary, 0, len(projects))}
	for _, p := range projects {
		resp.Projects = append(resp.Projects, &api.ProjectSummary{
			Id:          p.ID.String(),
			Name:        p.Name,
			Description: p.Description,
		})
	}

	return resp, nil
}

func (s *Service) UpdateProject(ctx context.Context, req *api.UpdateProjectRequest) (*api.ProjectResponse, error) {
	projectID, err := uuid.FromString(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	project, err := graphmodels.GetProjectByID(s.db, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load project: %v", err)
	}

	cfg := project.Config
	if req.GetConfigJson() != "" {
		cleaned, err := sanitizeJSON(req.GetConfigJson())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid config JSON: %v", err)
		}
		cfg = datatypes.JSON(cleaned)
	}

	if err := project.UpdateProject(s.db, project.ID, req.GetName(), req.GetDescription(), cfg); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update project: %v", err)
	}

	resp := &api.ProjectResponse{
		Id:          project.ID.String(),
		Name:        project.Name,
		Description: project.Description,
		ConfigJson:  string(project.Config)}

	return resp, nil
}

func (s *Service) DeleteProject(ctx context.Context, req *api.DeleteProjectRequest) (*emptypb.Empty, error) {
	projectID, err := uuid.FromString(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	project := &graphmodels.Project{}
	if err := project.DeleteProject(s.db, projectID); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete project: %v", err)
	}

	return &emptypb.Empty{}, nil
}
