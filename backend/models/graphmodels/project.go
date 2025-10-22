package graphmodels

import (
	"github.com/gofrs/uuid/v5"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Project struct {
	gorm.Model
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OwnerID     uuid.UUID      `gorm:"type:uuid"`
	Name        string         `gorm:"type:text;not null;unique"`
	Description string         `gorm:"type:text;not null;default:''"`
	Config      datatypes.JSON `gorm:"type:jsonb;default:'{}'"`
}

func (p *Project) CreateProject(engine *gorm.DB, userID uuid.UUID, projectName string, desc string, cfg datatypes.JSON) error {
	p.ID = uuid.Must(uuid.NewV4())
	p.OwnerID = userID
	p.Name = projectName
	p.Description = desc
	p.Config = cfg

	result := engine.Create(p)
	return result.Error
}

func (p *Project) DeleteProject(engine *gorm.DB, pID uuid.UUID) error {
	result := engine.Where("id = ?", pID).Delete(p)
	return result.Error
}

func (p *Project) UpdateProject(engine *gorm.DB, pID uuid.UUID, newProjectName string, newDesc string, newConfig datatypes.JSON) error {
	result := engine.Model(&p).Where("id = ?", pID).Updates(Project{Name: newProjectName, Description: newDesc, Config: newConfig})
	return result.Error
}

func GetProjectByID(engine *gorm.DB, projectID uuid.UUID) (*Project, error) {
	var project Project
	result := engine.First(&project, "id = ?", projectID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &project, nil
}

func ShowAllProjects(engine *gorm.DB, userID uuid.UUID) ([]Project, error) {
	var projects []Project
	if userID == uuid.Nil {
		// no user filter — return all projects
		result := engine.Find(&projects)
		return projects, result.Error
	}
	// use snake_case column name to match DB naming
	result := engine.Where("owner_id = ?", userID).Find(&projects)
	return projects, result.Error
}
