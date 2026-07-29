# chat-svc (Go)

Real-time messaging for Nyanoghar. This is the one service **not** written in
Fastify — it owns conversations, messages, presence and the WebSocket fan-out.

## Responsibilities

- Own the `conversations`, `messages`, `participants` and `blocks` tables.
- Terminate client WebSockets and fan messages out to connected participants.
- Serve gRPC to the Fastify services (create a thread when an application is
  submitted, redact a message when a moderator acts).
- Publish `chat.message.sent` / `chat.conversation.started` to NATS.

## Interfaces

| Surface | Address | Consumer |
| --- | --- | --- |
| WebSocket | `ws://chat-svc:8080/v1/chat/ws` | mobile & web clients, via the gateway |
| REST | `http://chat-svc:8080/v1/chat/*` | clients, via the gateway |
| gRPC | `chat-svc:50051` | Fastify services, server-to-server |

## Authentication

The service does **not** parse JWTs on the WebSocket path. The API gateway
verifies the token during the upgrade and forwards a trusted identity:

```
X-User-Id:     <uuid>
X-User-Roles:  ADOPTER,PET_OWNER
X-Session-Id:  <uuid>
```

These headers are only trustworthy because chat-svc is not exposed outside the
cluster — bind it to the internal network only, never publish port 8080.

On the gRPC path callers are peer services; use mTLS or a shared secret in
`CHAT_GRPC_TOKEN` before this leaves a private network.

## Generating the protobuf code

The contract lives in `packages/contracts/proto/nyanoghar/chat/v1/chat.proto`.

```bash
# from the repo root
pnpm proto:gen          # writes services/chat-svc/gen and the TS client
```

That requires [`buf`](https://buf.build/docs/installation). The `gen/`
directory is git-ignored — generate it as part of the build.

## Running

```bash
go mod tidy
go run ./cmd/server
```

## Status

Skeleton. `internal/hub` has the connection-management outline and the handlers
are stubbed; the storage layer and the gRPC server implementation are the next
pieces to write.
