# Nyanoghar — Backend

Backend for the Nyanoghar pet adoption and pet-care platform (Nepal). One
Fastify service in TypeScript for everything transactional, one Go service for
real-time messaging.

## Architecture

```
                          ┌───────────────────┐
      mobile / web  ─────▶│     core-api      │  :4000
                          │      Fastify      │
                          │ identity  catalog │
                          │ adoption  provider│
                          └────┬─────────┬────┘
                               │         │  /api/v1/chat (proxy + WS)
                               │         ▼
                               │   ┌───────────┐
                               │   │  chat-svc │  :8080
                               │   │     Go    │
                               │   └─────┬─────┘
                               ▼         ▼
                          core DB      chat DB
                  (schema per module)
                        Postgres + PostGIS
              NATS JetStream (events)   Redis (cache)
```

### Module boundaries

Inside `core-api`, each module owns a named Postgres schema and its own
routes:

| Module | Owns | Spec sections |
| --- | --- | --- |
| **identity** | accounts, sessions, roles, verification, profiles | 7.1, 7.2 |
| **catalog** | pet listings, species/breeds, media, favourites, search | 7.3 |
| **adoption** | applications, meetings, adoptions, reviews, reports | 6.1–6.3 |
| **provider** | clinics, shops, services, appointments | 6.4, 6.5 |
| **chat-svc** (Go) | conversations, messages, presence, WebSocket fan-out | messaging |

Two databases: `core-api` owns one, with a Postgres schema per module
(`identity`, `catalog`, `adoption`, `provider`); `chat-svc` owns the other.
A module reads and writes its own schema, reaching across only where the
domain requires it — adoption verifying a listing at submission time is the
motivating case. `core-api` and `chat-svc` coordinate through NATS events
(`packages/contracts/src/events.ts`). See `CLAUDE.md` for why this is not
five services.

---

## Repository layout

```
nyanoghar-backend/
├── packages/                 shared, versioned in-repo
│   ├── config/               env parsing + validation (fails fast)
│   ├── errors/               error taxonomy + Fastify error handler
│   ├── logger/               pino config with secret redaction
│   ├── auth/                 JWT verify, roles, Fastify auth plugin
│   └── contracts/            Zod schemas, event definitions, chat.proto
├── services/
│   ├── core-api/             identity · catalog · adoption · provider
│   │   ├── src/modules/      one directory per module
│   │   ├── src/db/schema/    one Postgres schema per module
│   │   └── drizzle/          committed migrations
│   └── chat-svc/             Go
└── infra/
    ├── docker-compose.yml
    └── init-databases.sh
```

---

## Getting started

```bash
cp .env.example .env
# Fill in JWT_ACCESS_SECRET (>=32 chars) and POSTGRES_PASSWORD:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

pnpm install
pnpm --filter "./packages/**" build   # core-api imports the built packages

pnpm infra:up                          # Postgres, Redis, NATS
pnpm db:migrate                        # apply committed migrations
pnpm dev                               # core-api in watch mode
```

Migrations are committed, so a fresh clone only needs `db:migrate`. Run
`pnpm db:generate` when you have *changed the schema* — it regenerates the
migration from `src/db/schema/`, and running it otherwise can produce a
spurious drift migration that CI will flag.

The Go service runs separately:

```bash
cd services/chat-svc && go run ./cmd/server
```

Full stack in Docker: `pnpm stack:up`.

### API docs

`core-api` serves Swagger UI at <http://localhost:4000/docs> outside
production. Every route is mounted under `/api/v1/...`.

---

## Authentication

Short-lived JWT access token + long-lived rotating refresh token.

- Access tokens are HS256, ~15 min, carrying `sub`, `roles`, `sid`.
- Refresh tokens are opaque 384-bit strings, stored **only as SHA-256 hashes**.
- Every refresh rotates the token. Presenting an already-rotated token is
  treated as theft: the whole session family is revoked
  (`auth.service.ts` → `refresh`).
- Passwords use Argon2id at the OWASP baseline (19 MiB, 2 passes).
- A login against a non-existent account still performs a dummy hash, so
  response timing does not reveal which emails are registered.

### Roles

`ADOPTER`, `PET_OWNER`, `ORGANIZATION`, `VETERINARIAN`, `PET_SHOP`,
`MODERATOR`, `ADMIN`. A user may hold several. `ADMIN` cannot be self-assigned
at registration or granted through the role API.

Guards live in `@nyanoghar/auth`: `app.authenticate`, `app.optionalAuth`,
`app.requireRoles(...)`, `app.requireVerifiedEmail`.

---

## The Go chat service

`chat-svc` is the only non-Fastify service. It terminates client WebSockets and
serves gRPC to `core-api`.

**Contract:** `packages/contracts/proto/nyanoghar/chat/v1/chat.proto` — the
single source of truth. Generate both sides with `pnpm proto:gen` (needs
[`buf`](https://buf.build/docs/installation)).

**Auth across the boundary:** browsers cannot set an `Authorization` header on
a WebSocket handshake, so `core-api` verifies the token during the upgrade
(accepting `?token=` or a bearer header) and forwards the identity as
`X-User-Id` / `X-User-Roles` / `X-Session-Id`.

> This is only safe because `chat-svc` is **not published to the host** — see
> the `expose:` block in `docker-compose.yml`. If it is ever reachable
> directly, those headers become client-controlled and the service must verify
> JWTs itself.

---

## Conventions

**Errors.** Throw a typed error from `@nyanoghar/errors`; the shared handler
turns it into `{ error: { code, message, details, requestId } }`. Unknown
errors become a generic 500 — internals never leak.

**Validation.** Zod at the boundary via `fastify-type-provider-zod`. Shared
shapes live in `@nyanoghar/contracts` so client and server cannot drift.

**State machines.** Listing and application lifecycles are explicit transition
tables (`ALLOWED_LISTING_TRANSITIONS`, `APPLICATION_TRANSITIONS`), not
ad-hoc `if` chains. The table also encodes *who* may make each move, which is
what stops an applicant approving their own application.

**Tracing.** `core-api` mints `x-request-id` and forwards it on the chat hop,
so one id covers a whole request chain.

**Logging.** Passwords, tokens, OTPs, ID numbers and medical notes are redacted
by the shared pino config.

---

## Status

`pnpm typecheck` and `pnpm lint` clean across 6 projects; **24 unit tests** and
**26 integration tests** passing. All 26 tables are live on Neon (`identity` 7,
`catalog` 6, `adoption` 6, `provider` 7, plus 22 enums in `public`). Verified
end to end: register → login → authenticated read, pet and provider search, and
the full adoption submission flow.

| Area | State |
| --- | --- |
| Shared packages | complete, building |
| core-api / identity | auth, sessions, roles, profiles — most complete; 9 unit tests |
| core-api / catalog | schema + routes + service layer + search; integration-tested; media pipeline pending |
| core-api / adoption | workflow engine + submission; 7 unit + 9 integration tests |
| core-api / provider | schema + routes + service layer + appointment transitions (8 unit tests) |
| chat-svc | skeleton — WS handler and gRPC return 501 |

Every module has its database access behind a `<module>.service.ts`, so the
logic is testable without booting HTTP.

### Tests

```bash
pnpm test                              # unit tests — no database needed

# Integration tests hit a real Postgres. Point this at a throwaway database
# (a Neon branch is ideal) — the suite writes and deletes rows.
cd services/core-api
TEST_DATABASE_URL='postgres://...' pnpm test:integration
```

Integration tests live in `services/core-api/test/integration/` and drive the
real app through `app.inject()`. Each run tags its fixtures with a unique
suffix and deletes them afterwards, so concurrent runs do not collide.

### CI

`.github/workflows/ci.yml` runs on every push and PR: lint, typecheck, unit
tests and a migration-drift check, plus a separate `go build` / `go vet` /
`go test` job for `chat-svc`. Integration tests run there too once the
`TEST_DATABASE_URL` secret is set.

### Known gaps

- The chat database is empty — `chat-svc` has no schema or migration tooling.
- No NATS publisher yet; event definitions exist but nothing emits them.
- `PATCH /api/v1/pets/:id` does not yet map nested location/health/behaviour
  patches onto columns.
- Verification codes are generated and stored but not dispatched; no email or
  SMS provider is wired in.
- Distance filtering uses a bounding box; PostGIS is installed but `geography`
  columns are not used yet.
- No S3/CloudFront media pipeline yet; `pet_media` stores a bare URL string.
