package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"syscall"

	"golang.org/x/term"
	"hscc"
	"hscc/internal/modules/auth/app"
	"hscc/internal/modules/auth/domain"
	"hscc/internal/modules/auth/infra"
	"hscc/internal/platform/config"
	"hscc/internal/platform/security"
	"hscc/internal/platform/sqlite"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cfg := config.LoadConfig()

	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	ctx := context.Background()
	// Ensure migrations are up to date (embedded filesystem with fallback to disk)
	migrationsFS, err := hscc.GetMigrationsFS()
	if err == nil {
		if err := db.MigrateFS(ctx, migrationsFS); err != nil {
			fmt.Fprintf(os.Stderr, "Error applying embedded migrations: %v\n", err)
			os.Exit(1)
		}
	} else {
		if err := db.Migrate(ctx, "./db/migrations"); err != nil {
			fmt.Fprintf(os.Stderr, "Error applying disk migrations: %v\n", err)
			os.Exit(1)
		}
	}

	repo := infra.NewAuthRepository(db)
	jwtMgr := security.NewJWTManager(cfg.JWTSecret, 0)
	authSvc := app.NewAuthService(repo, jwtMgr)

	switch os.Args[1] {
	case "bootstrap":
		bootstrapCmd := flag.NewFlagSet("bootstrap", flag.ExitOnError)
		username := bootstrapCmd.String("username", "admin", "Admin username")
		password := bootstrapCmd.String("password", "", "Admin password (optional, prompted if omitted)")
		_ = bootstrapCmd.Parse(os.Args[2:])

		if *password == "" {
			fmt.Printf("Enter password for admin user '%s' (min 8 chars): ", *username)
			bytePassword, err := term.ReadPassword(int(syscall.Stdin))
			fmt.Println()
			if err != nil {
				// Fallback to simple scan if not in interactive terminal
				reader := bufio.NewReader(os.Stdin)
				line, _ := reader.ReadString('\n')
				*password = strings.TrimSpace(line)
			} else {
				*password = strings.TrimSpace(string(bytePassword))
			}
		}

		user, err := authSvc.Bootstrap(ctx, *username, *password)
		if err != nil {
			if err == domain.ErrAdminAlreadyExists {
				fmt.Fprintln(os.Stderr, "Error: Initial admin user already exists. Bootstrap is disabled.")
			} else {
				fmt.Fprintf(os.Stderr, "Bootstrap failed: %v\n", err)
			}
			os.Exit(1)
		}

		fmt.Printf("✓ Administrator '%s' successfully bootstrapped (ID: %s)!\n", user.Username, user.ID)
		fmt.Println("✓ Bootstrap is now locked. You can start the server via hscc-api.")

	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Home Server Control Center (HSCC) CLI")
	fmt.Println("Usage:")
	fmt.Println("  hscc-cli bootstrap [--username <name>] [--password <pass>]   Initialize the primary admin user")
}
