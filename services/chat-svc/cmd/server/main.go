// Command server runs the Nyanoghar chat service: a WebSocket and REST
// endpoint for clients, plus a gRPC surface for the Fastify services.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nyanoghar/chat-svc/internal/config"
	"github.com/nyanoghar/chat-svc/internal/hub"
	"github.com/nyanoghar/chat-svc/internal/transport"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", slog.Any("err", err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg)
	logger.Info("starting", slog.String("env", cfg.Env), slog.String("addr", cfg.HTTPAddr))

	// Cancelled on SIGINT/SIGTERM; every goroutine hangs off this context.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	messageHub := hub.New(logger)

	server := &transport.Server{Hub: messageHub, Logger: logger}

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: it would cut off long-lived WebSocket connections.
		IdleTimeout: 120 * time.Second,
	}

	errCh := make(chan error, 1)

	go func() {
		logger.Info("http listening", slog.String("addr", cfg.HTTPAddr))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	// TODO: start the gRPC server on cfg.GRPCAddr once the generated stubs
	// exist (see README for the buf command), and connect to NATS.

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("http shutdown failed", slog.Any("err", err))
		return err
	}

	logger.Info("stopped cleanly")
	return nil
}

func newLogger(cfg *config.Config) *slog.Logger {
	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}

	opts := &slog.HandlerOptions{Level: level}

	// Structured JSON in production so logs match the Fastify services.
	if cfg.Env == "production" {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts)).
			With(slog.String("service", cfg.ServiceName))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts)).
		With(slog.String("service", cfg.ServiceName))
}
