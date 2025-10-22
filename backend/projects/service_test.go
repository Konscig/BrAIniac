package project_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	api "brainiac/gen"
	"brainiac/models/graphmodels"
	project "brainiac/projects"

	"github.com/gofrs/uuid/v5"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	user := os.Getenv("POSTGRES_USER")
	pass := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")
	host := os.Getenv("POSTGRES_HOST")
	port := os.Getenv("POSTGRES_PORT")

	if user == "" || pass == "" || dbname == "" || host == "" || port == "" {
		t.Fatal("set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT")
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, pass, dbname)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect db: %v", err)
	}

	// Сбрасываем таблицы
	err = db.Migrator().DropTable(&graphmodels.Project{}, &graphmodels.User{})
	if err != nil {
		t.Fatalf("failed to drop tables: %v", err)
	}

	err = db.AutoMigrate(&graphmodels.User{}, &graphmodels.Project{})
	if err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	return db
}

func TestProjectServiceCRUD(t *testing.T) {
	db := setupTestDB(t)
	svc := project.NewService(db)

	ctx := context.Background()

	// Создаем пользователя-владельца
	user := &graphmodels.User{
		ID:       uuid.Must(uuid.NewV4()),
		Email:    "owner@example.com",
		Username: "owner",
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}

	// --- CREATE ---
	createReq := &api.CreateProjectRequest{
		Name:    "Test Project",
		OwnerId: user.ID.String(),
	}
	created, err := svc.CreateProjectWithOwner(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateProject failed: %v", err)
	}
	if created.Name != "Test Project" {
		t.Fatalf("CreateProject: wrong name")
	}

	projectID := created.Id

	// --- GET ---
	getReq := &api.GetProjectRequest{ProjectId: projectID}
	got, err := svc.GetProject(ctx, getReq)
	if err != nil {
		t.Fatalf("GetProject failed: %v", err)
	}
	if got.Id != projectID {
		t.Fatalf("GetProject: IDs do not match")
	}

	// --- UPDATE ---
	updateReq := &api.UpdateProjectRequest{
		ProjectId:   projectID,
		Name:        "Updated Project",
		Description: "Updated description",
	}
	updated, err := svc.UpdateProject(ctx, updateReq)
	if err != nil {
		t.Fatalf("UpdateProject failed: %v", err)
	}
	if updated.Name != "Updated Project" || updated.Description != "Updated description" {
		t.Fatalf("UpdateProject: fields not updated")
	}

	// --- LIST ---
	listResp, err := svc.ListProjects(ctx, &api.ListProjectsRequest{})
	if err != nil {
		t.Fatalf("ListProjects failed: %v", err)
	}
	if len(listResp.Projects) != 1 {
		t.Fatalf("ListProjects: expected 1 project, got %d", len(listResp.Projects))
	}

	// --- DELETE ---
	deleteReq := &api.DeleteProjectRequest{ProjectId: projectID}
	_, err = svc.DeleteProject(ctx, deleteReq)
	if err != nil {
		t.Fatalf("DeleteProject failed: %v", err)
	}

	// Проверяем удаление
	_, err = svc.GetProject(ctx, getReq)
	if err == nil {
		t.Fatalf("GetProject after delete: expected error")
	}
}
