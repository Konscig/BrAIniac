package models

import (
	"errors"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Engine struct {
	gorm.Model
	Name     string
	User     string
	Password string
	Database string
	Uri      string
}

func (e Engine) CreateEngine() (*gorm.DB, error) {
	var dsn string
	var db *gorm.DB
	var err error

	switch e.Name {
	case "PostgreSQL":
		dsn = "postgresql://" + e.User + ":" + e.Password + "@" + e.Uri + "/" + e.Database + "?sslmode=disable"
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	case "MySQL":
		dsn = e.User + ":" + e.Password + "@tcp(" + e.Uri + ")/" + e.Database
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
	case "SQLite":
		db, err = gorm.Open(sqlite.Open(e.Database), &gorm.Config{})
	default:
		return nil, errors.New("unsupported database type")
	}
	return db, err
}
