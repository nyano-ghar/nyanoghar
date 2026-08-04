# Nyanoghar — Backend

[![CI](https://github.com/nyano-ghar/nyanoghar/actions/workflows/ci.yml/badge.svg)](https://github.com/nyano-ghar/nyanoghar/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

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
(`packages/contracts/src/events.ts`).

These four modules used to be four services behind a gateway. They shared a
database, so the split bought no isolation while charging a network hop
wherever two domains met. Chat stays separate because its workload genuinely
differs: WebSocket fan-out, high-frequency small writes, its own scaling and
retention.

---

## Repository layout

```
nyanoghar/
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

**Requirements:** Node 22+, [pnpm](https://pnpm.io/installation), and Docker
(for Postgres). Go 1.23+ only if you want to work on the chat service.

```bash
git clone https://github.com/nyano-ghar/nyanoghar.git
cd nyanoghar

cp .env.example .env    # works as-is; no editing required
pnpm install
pnpm infra:up           # Postgres with PostGIS on :5432
pnpm setup              # build packages, migrate, seed reference data
pnpm dev                # http://localhost:4000/docs
```

That is the whole setup. **No AWS account, no cloud database, and no secrets to
generate** — the defaults in `.env.example` match the docker-compose defaults,
and both are development-only placeholders.

Check it came up:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/reference/species
```

Then register a user and call an authenticated route:

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{
        "fullName": "Test User",
        "email": "you@example.com",
        "password": "Correct1Horse",
        "acceptedTermsVersion": "1.0"
      }'
```

### What runs without extra setup

| Feature | Without configuration |
| --- | --- |
| identity, catalog, adoption, provider | **fully working** |
| Media upload/download | routes return **501** — see below to enable locally |
| Real-time chat | `chat-svc` is a skeleton; endpoints return 501 |
| Redis / NATS | not used by any code path yet — containers optional |

Media is deliberately optional: requiring two S3 buckets and a CloudFront
distribution to run a pet-listing API would put an AWS bill between a
contributor and their first commit. `pnpm infra:up:all` adds Redis and NATS if
you are working on something that needs them.

### Working on media (no AWS account needed)

S3 is a *protocol*, not only an AWS product, so the same code path that talks to
AWS in production talks to [MinIO](https://min.io/) locally:

```bash
pnpm infra:up:media    # Postgres + MinIO, buckets created automatically
```

Then uncomment the MinIO block in your `.env` (option 2 — the values already
match the compose defaults) and restart `pnpm dev`. Uploads genuinely work end
to end: presign → `PUT` → confirm, with real signatures. The MinIO console is at
<http://localhost:9001>.

The same two settings point at any S3-compatible provider, so none of this is
local-only scaffolding:

| Provider | `MEDIA_S3_ENDPOINT` | `MEDIA_S3_FORCE_PATH_STYLE` |
| --- | --- | --- |
| AWS S3 | *unset* | `false` |
| MinIO (local) | `http://localhost:9000` | `true` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` | `true` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | `true` |
| DigitalOcean Spaces | `https://<region>.digitaloceanspaces.com` | `false` |

The five credential settings (`MEDIA_S3_ACCESS_KEY_ID`,
`MEDIA_S3_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BUCKET`, `MEDIA_PRIVATE_BUCKET`,
`MEDIA_CDN_DOMAIN`) are all-or-nothing: set them together or leave them all
unset. A partial set is rejected at startup, because a deploy that silently
fell back to the stub would accept uploads and store nothing.

### Database options

`pnpm infra:up` is the default and needs nothing but Docker. To use a hosted
Postgres instead ([Neon](https://neon.tech) has a free tier), skip it and point
`DATABASE_URL` at your own instance — the schema needs the `postgis` and
`pg_trgm` extensions, which `infra/init-databases.sh` installs automatically
for the Docker path.

Migrations are committed, so a fresh clone only needs `db:migrate` (included in
`pnpm setup`). Run `pnpm db:generate` when you have *changed the schema* — it
regenerates the migration from `src/db/schema/`, and running it otherwise can
produce a spurious drift migration that CI will flag.

`pnpm db:seed` is idempotent and inserts only reference data (species and
breeds); rerun it freely. `pnpm infra:reset` destroys the database volume for a
clean slate.

The Go service runs separately:

```bash
cd services/chat-svc && go run ./cmd/server
```

Full stack in Docker: `pnpm stack:up`.

> **A note on the defaults.** `docker-compose.yml` and `.env.example` ship
> working credentials so the project runs immediately. They are public, shared
> by every clone, and intended for localhost only. Replace
> `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD` and `DATABASE_URL` before running
> this anywhere reachable from a network.

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

`pnpm typecheck` and `pnpm lint` clean across 6 projects; **45 unit tests** and
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

# Integration tests hit a real Postgres and write and delete rows, so point
# them at a throwaway database. Your local docker-compose one is fine:
cd services/core-api
TEST_DATABASE_URL='postgres://nyanoghar:nyanoghar@localhost:5432/nyanoghar' pnpm test:integration
```

TLS is chosen from the host: on for hosted Postgres (Neon, RDS), off for
localhost, and `?sslmode=` in the URL overrides either way.

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
- EXIF location is not stripped from images before publishing.
- Media requires storage credentials; without them the upload routes return
  501 (see [Working on media](#working-on-media-no-aws-account-needed)).

---

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the
conventions that come up most in review, and how to run the tests. The
[Known gaps](#known-gaps) list above is a good source of starter work.

- **Questions and setup help** — [SUPPORT.md](SUPPORT.md)
- **Bugs and features** — [open an issue](https://github.com/nyano-ghar/nyanoghar/issues/new/choose)
- **Security vulnerabilities** — [SECURITY.md](SECURITY.md), never a public issue
- **Community expectations** — [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **What changed** — [CHANGELOG.md](CHANGELOG.md)

## License

Licensed under the [Apache License 2.0](LICENSE).

Contributions are accepted under the same licence. There is no CLA: under
Apache 2.0 §5, anything you deliberately submit for inclusion is licensed to
the project under those terms.
