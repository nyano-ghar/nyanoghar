// Package hub tracks live WebSocket connections and fans messages out to the
// participants of a conversation.
package hub

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Client is one live WebSocket connection. A single user may hold several
// (phone, tablet, web), so connections are keyed by user and tracked as a set.
type Client struct {
	ID     string
	UserID string
	// send is buffered; when it fills, the client is too slow and gets dropped
	// rather than being allowed to block the fan-out.
	send   chan []byte
	cancel context.CancelFunc
}

// NewClient creates a client with a bounded outbound buffer.
func NewClient(id, userID string, buffer int, cancel context.CancelFunc) *Client {
	return &Client{
		ID:     id,
		UserID: userID,
		send:   make(chan []byte, buffer),
		cancel: cancel,
	}
}

// Outbound exposes the send channel to the connection writer goroutine.
func (c *Client) Outbound() <-chan []byte { return c.send }

// Hub owns the connection registry. All access is guarded by mu; the maps are
// small enough that a single mutex is not a bottleneck at this scale.
type Hub struct {
	mu sync.RWMutex

	// userID -> set of that user's live connections.
	clients map[string]map[string]*Client

	// conversationID -> set of userIDs, cached so a fan-out does not hit the
	// database on every message.
	rooms map[string]map[string]struct{}

	logger      *slog.Logger
	dropTimeout time.Duration
}

// New builds an empty hub.
func New(logger *slog.Logger) *Hub {
	return &Hub{
		clients:     make(map[string]map[string]*Client),
		rooms:       make(map[string]map[string]struct{}),
		logger:      logger,
		dropTimeout: 5 * time.Second,
	}
}

// Register adds a connection to the registry.
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.UserID]; !ok {
		h.clients[client.UserID] = make(map[string]*Client)
	}
	h.clients[client.UserID][client.ID] = client

	h.logger.Debug("client registered",
		slog.String("user_id", client.UserID),
		slog.String("client_id", client.ID),
		slog.Int("connections", len(h.clients[client.UserID])),
	)
}

// Unregister removes a connection and closes its outbound channel.
func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	connections, ok := h.clients[client.UserID]
	if !ok {
		return
	}

	if _, ok := connections[client.ID]; ok {
		delete(connections, client.ID)
		close(client.send)
	}

	if len(connections) == 0 {
		delete(h.clients, client.UserID)
	}
}

// JoinRoom caches a user's membership of a conversation.
func (h *Hub) JoinRoom(conversationID, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.rooms[conversationID]; !ok {
		h.rooms[conversationID] = make(map[string]struct{})
	}
	h.rooms[conversationID][userID] = struct{}{}
}

// LeaveRoom drops a cached membership.
func (h *Hub) LeaveRoom(conversationID, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if members, ok := h.rooms[conversationID]; ok {
		delete(members, userID)
		if len(members) == 0 {
			delete(h.rooms, conversationID)
		}
	}
}

// BroadcastToConversation delivers payload to every connected participant
// except excludeUserID (normally the sender, who already rendered the message
// optimistically).
func (h *Hub) BroadcastToConversation(conversationID string, payload []byte, excludeUserID string) {
	h.mu.RLock()
	members := make([]string, 0, len(h.rooms[conversationID]))
	for userID := range h.rooms[conversationID] {
		if userID != excludeUserID {
			members = append(members, userID)
		}
	}
	h.mu.RUnlock()

	for _, userID := range members {
		h.SendToUser(userID, payload)
	}
}

// SendToUser delivers payload to every live connection a user holds. A client
// whose buffer is full is disconnected: dropping one slow consumer is better
// than stalling the fan-out for everyone else.
func (h *Hub) SendToUser(userID string, payload []byte) {
	h.mu.RLock()
	connections := make([]*Client, 0, len(h.clients[userID]))
	for _, client := range h.clients[userID] {
		connections = append(connections, client)
	}
	h.mu.RUnlock()

	for _, client := range connections {
		select {
		case client.send <- payload:
		default:
			h.logger.Warn("dropping slow client",
				slog.String("user_id", userID),
				slog.String("client_id", client.ID),
			)
			client.cancel()
		}
	}
}

// OnlineUsers reports how many distinct users are currently connected.
func (h *Hub) OnlineUsers() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// IsOnline reports whether a user has at least one live connection. Used to
// decide between live delivery and a push notification.
func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID]) > 0
}
