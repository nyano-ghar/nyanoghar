# syntax=docker/dockerfile:1.7
FROM golang:1.23-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
# Static binary so the runtime stage can be scratch-thin.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/chat-svc ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/chat-svc /chat-svc

USER nonroot:nonroot
EXPOSE 8080 50051
ENTRYPOINT ["/chat-svc"]
