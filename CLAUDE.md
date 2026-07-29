# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Backend for **Nyanoghar**, a pet adoption and pet-care platform targeting
Nepal. One Fastify + TypeScript service for everything transactional, one Go
service for real-time chat.

`nyanoghar-backend-project-overview.md` is the **product spec** — 1,565 lines
describing the full long-term platform. It is a requirements document, not a
description of what is built. Treat it as the source of truth for *intent*,
never for *status*. Section numbers (§7.6, §22, …) are useful anchors when
discussing scope.

This is a standalone project, unrelated to the NestJS app in `../backend`.

## Commands

```bash
pnpm install
pnpm --filter "./packages/**" build    # core-api imports built packages — run first
pnpm typecheck                          # all 6 projects
pnpm lint                               # biome check (lint + format verify)
pnpm lint:fix                           # biome check --write
pnpm test                               # unit tests — no database needed
pnpm dev                                # core-api in watch mode

# Integration tests hit a real Postgres. Point this at a throwaway database
# (a Neon branch is ideal) — the suite writes and deletes rows.
cd services/core-api
TEST_DATABASE_URL='postgres://...' pnpm test:integration

pnpm infra:up                           # Postgres, Redis, NATS
pnpm db:generate                        # regenerate migrations from schema
pnpm db:migrate                         # apply

cd services/chat-svc && go run ./cmd/server
```

Swagger UI outside production: `http://localhost:4000/docs`.

## Architecture

Two services, two databases.

```
                    core-api :4000
        identity · catalog · adoption · provider
                          |
                  ┌───────┴────────┐
             core DB          chat-svc :8080 (Go)
      (schema per module)           |
        Postgres + PostGIS       chat DB
     NATS JetStream · Redis · S3+CloudFront
```

**Why one core service.** identity, catalog, adoption and provider were four
Fastify services behind a gateway. They shared a database, so the split bought
no isolation while charging a network hop wherever two domains met — which is
why application submission sat at 501 for so long. They are now modules in one
process. Chat stays separate: genuinely different workload (WebSocket fan-out,
high-frequency small writes), its own runtime, its own database, its own
scaling and retention.

**Module boundaries inside core-api.** `src/modules/<module>/` with its own
routes and services, and `src/db/schema/<module>/` owning a named Postgres
schema (`identity`, `catalog`, `adoption`, `provider`).

| Module | Owns | Spec |
| --- | --- | --- |
| identity | accounts, sessions, roles, verification, profiles | 7.1, 7.2 |
| catalog | pet listings, species/breeds, media, favourites, search | 7.3 |
| adoption | applications, meetings, adoptions, reviews, reports | 6.1–6.3 |
| provider | clinics, shops, services, appointments | 6.4, 6.5 |
| chat-svc (Go) | conversations, messages, presence, WS fan-out | 7.9 |

A module reads and writes its own schema. Reaching across is allowed only
where the domain genuinely requires it, and should stay a read — the
motivating case is adoption verifying a `catalog.pets` listing at submission
time (`applications.service.ts` → `submit`). Prefer that to reintroducing a
network call, but do not let it become a habit: if two modules start joining
constantly, the boundary is in the wrong place.

Each module declares its schema once in `src/db/schema/<module>/_schema.ts`
and defines tables with `<name>Schema.table(...)` instead of `pgTable(...)`.
Enum types intentionally stay in `public` — they are global type names and do
not collide (22 distinct enums, verified). When adding a table, use the
module's schema object; a bare `pgTable` silently lands it in `public`.

Dev and prod both run on **Neon** (serverless Postgres, PG 18). The `postgres`
driver is configured with `prepare: false` so it stays compatible with
transaction-mode poolers — do not remove that.

Cross-service coordination (core-api ↔ chat) uses NATS events
(`packages/contracts/src/events.ts`). Contracts are defined; **nothing
publishes them yet**.

## Media: S3 + CloudFront

Binary media never transits the API. Clients upload directly to S3 with a
presigned URL and read through CloudFront.

- **Upload**: client asks for a presigned `PUT`, uploads straight to S3, then
  confirms so the row is written. Validate declared content-type and size
  limits when minting the URL — never trust the client-supplied filename or
  MIME type (spec §15).
- **Public media** (approved listing photos) is served via CloudFront.
  Store the **S3 key**, not a full URL, and build the CDN URL at read time —
  otherwise the CDN domain is baked into every historical row.
- **Private media** (verification documents, health records) lives in a
  separate private bucket, is never CloudFront-cached publicly, and is read
  through short-lived presigned `GET`s. Spec §7.14 and §17 require this.
- Strip EXIF location before publishing an image (§15, §17).

`pet_media` currently stores a bare `url` text column with an `is_private`
flag. Moving to `bucket` + `key` + derived URL is a prerequisite, and is not
done yet.

## Conventions

**Layering.** Routes validate, delegate and serialize — nothing else. Business
logic and every database call live in `<module>.service.ts`, constructed once
per route plugin (`new XService(app.db, app.config)`). A route touching
`app.db` directly is a smell; the only legitimate `app.db` in a route file is
that constructor. This is what makes the logic testable without booting HTTP.

**Drizzle relations need both sides.** A `many()` without its matching
`one()` inverse is **not** a type error — it throws "There is not enough
information to infer relation" the first time the query runs. Three relations
shipped broken this way (`applications.history`, `pets.statusHistory`,
`providers.openingHours`), and only an integration test caught them. When you
add a `many()`, add the inverse `one()` in the same commit.

**Errors.** Throw a typed error from `@nyanoghar/errors`; the shared handler
renders `{ error: { code, message, details, requestId } }`. Unknown errors
become a generic 500 — internals never leak. Fastify's own 4xx (413, 415, …)
are mapped to named codes rather than reported as INTERNAL.

**Validation.** Zod at the boundary via `fastify-type-provider-zod`. Shared
shapes live in `@nyanoghar/contracts` so client and server cannot drift.

**State machines.** Listing and application lifecycles are explicit transition
tables (`ALLOWED_LISTING_TRANSITIONS`, `APPLICATION_TRANSITIONS`), not ad-hoc
`if` chains. The table also encodes *who* may make each move — this is what
stops an applicant approving their own application. Extend the table; do not
add branching around it.

**Auth.** HS256 access tokens (~15 min) carrying `sub`, `roles`, `sid`.
Refresh tokens are opaque 384-bit strings stored only as SHA-256 hashes, and
every refresh rotates. Presenting an already-rotated token is treated as theft
and revokes the whole session family (`auth.service.ts` → `refresh`).
Passwords use Argon2id at the OWASP baseline. Login against a non-existent
account still performs a dummy hash so timing does not leak which emails
exist. Preserve these properties when touching auth.

Roles: `ADOPTER`, `PET_OWNER`, `ORGANIZATION`, `VETERINARIAN`, `PET_SHOP`,
`MODERATOR`, `ADMIN`. A user may hold several. `ADMIN` is never
self-assignable. Guards: `app.authenticate`, `app.optionalAuth`,
`app.requireRoles(...)`, `app.requireVerifiedEmail`.

**Chat boundary.** Browsers cannot set an `Authorization` header on a WS
handshake, so core-api verifies the token at upgrade (accepting `?token=` or a
bearer header) and forwards `X-User-Id` / `X-User-Roles` / `X-Session-Id`.
This is only safe because `chat-svc` is **not published to the host**
(`expose:` in `docker-compose.yml`). If it ever becomes directly reachable,
those headers turn client-controlled and chat-svc must verify JWTs itself.

**Routing.** core-api mounts everything under `/api/v1/...` — the prefix the
old gateway used to add, kept so clients did not have to change. `/api/v1/chat`
is proxied to chat-svc.

**Tracing.** core-api mints `x-request-id` and forwards it on the chat hop, so
one id spans the request chain.

**Logging.** Passwords, tokens, OTPs, ID numbers and medical notes are
redacted by the shared pino config. Do not log raw request bodies on auth or
verification routes. `console.*` is a lint error (bypasses redaction) — use
`app.log` / `request.log`; `console.error` and `console.warn` are allowed for
genuine startup failures.

**Lint and format.** Biome, configured at the repo root (`biome.json`).
`pnpm lint` runs in CI and fails the build, so format before committing.

**Server limits.** `bodyLimit` is 1 MiB (media goes to S3 via presigned URLs
and never transits the API). `keepAliveTimeout` (72s) must stay **above** the
load balancer's idle timeout or you get intermittent 502s. Shutdown drains
in-flight requests with a 15s forced-exit timer — keep that under the
orchestrator's grace period (30s on Kubernetes) or the pool never closes.

**Health vs readiness.** `/health` is liveness only. `/ready` fails (503) only
when the **database** is unreachable; chat being down reports
`200 degraded`, because failing readiness on a soft dependency would pull
every instance out of rotation over a chat outage.

**Migrations.** Generated by drizzle-kit into `services/core-api/drizzle/` and
committed. Requires **drizzle-kit ≥ 0.31** — 0.30.x cannot resolve the
NodeNext `.js` import specifiers the schema files use and fails with
`Cannot find module './users.js'`. Never strip those extensions to work around
a tool; they are required by `module: NodeNext`.

## Database schema notes

- Soft deletes: uniqueness on `users.email` / `users.phone` is enforced by a
  **partial** unique index `WHERE deleted_at IS NULL`, so a deleted account
  frees its address.
- Geo search currently uses a bounding box over `latitude`/`longitude` with a
  btree index. PostGIS 3.6 and pg_trgm are installed on the core database but
  no `geography` column is in use — the radius filter is approximate and
  worsens with latitude.
- `gen_random_uuid()` is used for PKs.

## Current state

Verified: `pnpm typecheck` clean across 6 projects; `pnpm lint` clean; **24
unit tests** (9 identity crypto, 7 adoption transitions, 8 appointment
transitions) and **26 integration tests** passing against Neon. CI runs
lint, typecheck, unit tests and a migration-drift check on every push and PR
(`.github/workflows/ci.yml`); integration tests run there too once the
`TEST_DATABASE_URL` secret is set.

Integration tests live in `services/core-api/test/integration/` and drive the
real app through `app.inject()`. Each run tags its fixtures with a unique
suffix and deletes them in `afterAll`, so runs do not collide. They are
single-threaded and use a small pool — three files each opening the
production default of ten connections exhausts a serverless Postgres.
Per-route rate limits are disabled under `NODE_ENV=test`
(`src/common/rate-limit.ts`) so the suite fails on behaviour, not throttling.

All 26 tables are live on the Neon core database — `identity` 7, `catalog` 6,
`adoption` 6, `provider` 7 — plus 22 enums in `public`. The four per-service
migrations were replaced by one consolidated baseline
(`0000_black_bloodaxe.sql`) and the journal reconciled, so `db:migrate` is a
clean no-op against the existing database.

Verified end to end against Neon: register → login → authenticated `/users/me`,
`GET /api/v1/pets`, `GET /api/v1/reference/species`, `GET /api/v1/providers`,
and the full adoption submission flow (201, plus 422 on duplicate, 422 on a
non-published listing, 404 on a missing one).

| Area | State |
| --- | --- |
| shared packages | complete, building |
| core-api / identity | auth, sessions, roles, profiles — most complete, 9 tests |
| core-api / catalog | schema + routes + service layer + search; integration-tested; media pipeline pending |
| core-api / provider | schema + routes + service layer + appointment transitions (8 tests) |
| core-api / adoption | workflow engine + submission; 7 unit + 9 integration tests |
| chat-svc | skeleton — WS handler and gRPC return 501 |

### Known gaps

- **The chat database is empty and has no schema.** `chat-svc` reads
  `DATABASE_URL` but defines no tables and has no migration tooling — there is
  no Go equivalent of the drizzle setup. Messages/conversations/presence
  storage is unbuilt.
- No NATS publisher. Event contracts exist; nothing emits.
- `PATCH /api/v1/pets/:id` does not map nested location/health/behaviour
  patches onto columns (`pets.routes.ts`).
- No S3/CloudFront code anywhere yet.
- Verification codes are generated and stored but never dispatched; no email
  or SMS provider is wired in.

### Production readiness — still open

Ordered by what blocks a real deploy. The service-layer extraction and the
integration suite are done — see above.

1. **No error tracking or metrics.** No Sentry, no `/metrics`, no
   OpenTelemetry. Spec §19 asks for all three. Structured logs with request
   ids are in place and are the only current signal.
2. **Secrets and deploy story.** Production secret management is undefined,
   and there is no documented migrate-then-deploy ordering or rollback plan.
   Neon branching makes rollback feasible; it just is not written down.
3. **Integration tests share one database.** Fine now, but a dedicated Neon
   branch per CI run would remove the last ordering assumptions.
4. **Structure nits.** `src/lib/crypto.ts` is identity-specific but sits at
   the top level. `src/common/` now exists (rate-limit lives there) and is
   where shared guards and hooks should go.

## Working here

- The spec is aspirational and large. Build against §22 (the MVP list) unless
  told otherwise; §23 is explicitly out of scope.
- Prefer finishing a vertical slice over broadening surface area — the repo
  already has more routes than working flows.
- Resist re-splitting core-api into services. It was four services and a
  gateway; the split cost a network hop per cross-domain read and bought
  nothing while they shared a database. Extract a module only when it needs
  its own database, runtime, or scaling story — the test chat-svc passes.
