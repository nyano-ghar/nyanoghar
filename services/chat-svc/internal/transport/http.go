package transport

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/nyanoghar/chat-svc/internal/hub"
)

// Server wires the HTTP and WebSocket handlers.
type Server struct {
	Hub    *hub.Hub
	Logger *slog.Logger
}

// Routes builds the service's HTTP mux.
func (s *Server) Routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /ready", s.handleReady)

	// Client-facing endpoints, all reached through the API gateway.
	mux.HandleFunc("GET /v1/chat/ws", s.handleWebSocket)
	mux.HandleFunc("GET /v1/chat/conversations", s.handleListConversations)
	mux.HandleFunc("POST /v1/chat/conversations", s.handleCreateConversation)
	mux.HandleFunc("GET /v1/chat/conversations/{id}/messages", s.handleListMessages)
	mux.HandleFunc("POST /v1/chat/conversations/{id}/messages", s.handleSendMessage)
	mux.HandleFunc("POST /v1/chat/conversations/{id}/read", s.handleMarkRead)

	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "chat-svc",
	})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	// TODO: verify the database pool and the NATS connection before reporting
	// ready, so Kubernetes does not route traffic to a half-open instance.
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"online":  s.Hub.OnlineUsers(),
		"service": "chat-svc",
	})
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	identity, err := IdentityFromRequest(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing caller identity")
		return
	}

	// TODO: accept the upgrade with coder/websocket, register a hub client,
	// then run the read and write pumps until the context is cancelled.
	s.Logger.Info("websocket upgrade requested",
		slog.String("user_id", identity.UserID),
	)
	writeError(w, http.StatusNotImplemented, "NOT_IMPLEMENTED",
		"WebSocket handling is not implemented yet")
}

func (s *Server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	s.notImplemented(w, r, "list conversations")
}

func (s *Server) handleCreateConversation(w http.ResponseWriter, r *http.Request) {
	s.notImplemented(w, r, "create conversation")
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	s.notImplemented(w, r, "list messages")
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	s.notImplemented(w, r, "send message")
}

func (s *Server) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	s.notImplemented(w, r, "mark read")
}

// notImplemented enforces authentication before reporting the gap, so the
// stubs cannot be used to probe the service anonymously.
func (s *Server) notImplemented(w http.ResponseWriter, r *http.Request, operation string) {
	if _, err := IdentityFromRequest(r); err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing caller identity")
		return
	}
	writeError(w, http.StatusNotImplemented, "NOT_IMPLEMENTED", operation+" is not implemented yet")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}
