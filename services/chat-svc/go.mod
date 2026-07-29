module github.com/nyanoghar/chat-svc

go 1.23

// The skeleton builds against the standard library only, so `go build` works
// before any modules are downloaded. Add these as the implementation lands:
//
//	go get github.com/coder/websocket   // WebSocket transport
//	go get github.com/jackc/pgx/v5      // Postgres driver and pool
//	go get google.golang.org/grpc       // gRPC server for peer services
//	go get github.com/nats-io/nats.go   // event publishing
