// Package config loads chat-svc settings from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds every setting the service needs. Values are read once at
// startup so a misconfigured container fails immediately rather than on the
// first request.
type Config struct {
	ServiceName string
	Env         string
	LogLevel    string

	HTTPAddr string
	GRPCAddr string

	DatabaseURL  string
	DatabasePool int32

	NATSURL string

	// WriteTimeout bounds a slow consumer; a client that cannot keep up is
	// disconnected rather than allowed to grow an unbounded buffer.
	WriteTimeout time.Duration
	PingInterval time.Duration
	MaxMessageKB int

	// AllowedUpgradeOrigins is enforced only when the service is reachable
	// outside the cluster; normally the gateway is the sole client.
	AllowedUpgradeOrigins []string
}

// Load reads configuration from the environment, applying defaults.
func Load() (*Config, error) {
	cfg := &Config{
		ServiceName:  getEnv("SERVICE_NAME", "chat-svc"),
		Env:          getEnv("NODE_ENV", "development"),
		LogLevel:     getEnv("LOG_LEVEL", "info"),
		HTTPAddr:     getEnv("HTTP_ADDR", ":8080"),
		GRPCAddr:     getEnv("GRPC_ADDR", ":50051"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		NATSURL:      getEnv("NATS_URL", "nats://nats:4222"),
		WriteTimeout: getDuration("WS_WRITE_TIMEOUT", 10*time.Second),
		PingInterval: getDuration("WS_PING_INTERVAL", 30*time.Second),
		MaxMessageKB: getInt("WS_MAX_MESSAGE_KB", 64),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	pool := getInt("DATABASE_POOL_MAX", 10)
	cfg.DatabasePool = int32(pool)

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
