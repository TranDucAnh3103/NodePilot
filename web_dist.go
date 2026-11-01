package hscc

import (
	"embed"
	"io/fs"
)

//go:embed web/dist/*
var WebDistFS embed.FS

// GetWebFS returns the sub-filesystem pointing to web/dist.
func GetWebFS() (fs.FS, error) {
	return fs.Sub(WebDistFS, "web/dist")
}
