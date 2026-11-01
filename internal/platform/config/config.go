package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
)

type Config struct {
	Host             string
	Port             int
	DBPath           string
	JWTSecret        string
	HelperSocketPath string
	AllowedOrigins   []string
	CollectIntervalS int
	MaxWSClients     int
}

func LoadConfig() *Config {
	host := getEnv("HSCC_HOST", "127.0.0.1")
	portStr := getEnv("HSCC_PORT", "17880")
	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 17880
	}

	dbPath := getEnv("HSCC_DB_PATH", "./data/hscc.db")
	jwtSecret := getEnv("HSCC_JWT_SECRET", "")
	if jwtSecret == "" {
		// Generate random ephemeral secret if not set
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		jwtSecret = hex.EncodeToString(b)
	}

	helperSocket := getEnv("HSCC_HELPER_SOCKET", "/run/hscc/helper.sock")
	if _, err := os.Stat("/run/hscc"); os.IsNotExist(err) {
		helperSocket = "./data/helper.sock"
	}

	intervalStr := getEnv("HSCC_COLLECT_INTERVAL_S", "3")
	interval, err := strconv.Atoi(intervalStr)
	if err != nil || interval < 1 {
		interval = 3
	}

	maxClientsStr := getEnv("HSCC_MAX_WS_CLIENTS", "3")
	maxClients, err := strconv.Atoi(maxClientsStr)
	if err != nil || maxClients < 1 {
		maxClients = 3
	}

	return &Config{
		Host:             host,
		Port:             port,
		DBPath:           dbPath,
		JWTSecret:        jwtSecret,
		HelperSocketPath: helperSocket,
		AllowedOrigins:   []string{"http://127.0.0.1:17880", "http://localhost:17880", "https://homeserver310306"},
		CollectIntervalS: interval,
		MaxWSClients:     maxClients,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
