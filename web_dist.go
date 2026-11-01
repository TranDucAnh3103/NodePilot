package hscc

import (
	"embed"
	"io/fs"
)

//go:embed web/dist/*
var WebDistFS embed.FS

//go:embed db/migrations/*.sql
var MigrationsFS embed.FS

// GetWebFS returns the sub-filesystem pointing to web/dist.
func GetWebFS() (fs.FS, error) {
	return fs.Sub(WebDistFS, "web/dist")
}

// GetMigrationsFS returns the sub-filesystem pointing to db/migrations.
func GetMigrationsFS() (fs.FS, error) {
	return fs.Sub(MigrationsFS, "db/migrations")
}
