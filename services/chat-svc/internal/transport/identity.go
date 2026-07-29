// Package transport contains the HTTP and WebSocket entry points.
package transport

import (
	"errors"
	"net/http"
	"strings"
)

// Identity is the caller as asserted by the API gateway.
//
// The gateway verifies the JWT during the WebSocket upgrade and forwards the
// result in these headers. That is only safe because chat-svc is bound to the
// internal network — if it is ever exposed directly, these headers become
// client-controlled and the service must verify tokens itself instead.
type Identity struct {
	UserID    string
	Roles     []string
	SessionID string
}

// ErrMissingIdentity is returned when the gateway headers are absent.
var ErrMissingIdentity = errors.New("missing gateway identity headers")

// IdentityFromRequest extracts the caller identity from the trusted headers.
func IdentityFromRequest(r *http.Request) (Identity, error) {
	userID := r.Header.Get("X-User-Id")
	if userID == "" {
		return Identity{}, ErrMissingIdentity
	}

	roles := []string{}
	if raw := r.Header.Get("X-User-Roles"); raw != "" {
		for _, role := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(role); trimmed != "" {
				roles = append(roles, trimmed)
			}
		}
	}

	return Identity{
		UserID:    userID,
		Roles:     roles,
		SessionID: r.Header.Get("X-Session-Id"),
	}, nil
}

// HasRole reports whether the caller holds role.
func (i Identity) HasRole(role string) bool {
	for _, held := range i.Roles {
		if held == role {
			return true
		}
	}
	return false
}

// IsStaff reports whether the caller can act on moderation endpoints.
func (i Identity) IsStaff() bool {
	return i.HasRole("MODERATOR") || i.HasRole("ADMIN")
}
