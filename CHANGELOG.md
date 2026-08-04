# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Nyanoghar is pre-1.0: until `1.0.0`, minor versions may contain breaking
changes. Anything that changes an API response, a required environment
variable, or the database schema is called out under **Changed** or **Removed**
regardless of version.

## [Unreleased]

### Added

- Apache 2.0 licence, `NOTICE`, code of conduct, security policy, support
  guide, issue and pull request templates, and `.gitattributes`.
- `AGENTS.md` — concise repository conventions for contributors and coding
  agents.
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
  for commit messages, documented in `CONTRIBUTING.md` and `AGENTS.md`.
- Local S3-compatible media development via MinIO (`pnpm infra:up:media`), with
  `MEDIA_S3_ENDPOINT` and `MEDIA_S3_FORCE_PATH_STYLE`. The same settings point
  at Cloudflare R2, Backblaze B2 or DigitalOcean Spaces in production.
- `StubMediaStorage`, used when no S3 credentials are configured, so the
  service runs with no AWS account. Upload routes return 501 with an
  actionable message; every other route is unaffected.
- `pnpm db:seed` — idempotent reference data (5 species, 29 breeds relevant to
  Nepal). A freshly migrated database previously had none, which made
  `POST /api/v1/pets` impossible because a listing requires a `species_id`.
- `pnpm setup`, `pnpm infra:up:media` and `pnpm infra:reset` scripts.
- `CONTRIBUTING.md` with a troubleshooting section for common first-run
  failures.

### Changed

- The five `MEDIA_*` S3 settings are now optional, validated all-or-nothing.
  A partial set is rejected at startup — a deploy that silently fell back to
  the stub would accept uploads and store nothing.
- `pnpm infra:up` starts Postgres only. Redis and NATS are not yet used by any
  code path; `pnpm infra:up:all` still starts everything.
- `docker-compose.yml` and `.env.example` ship working development-only
  defaults, so a fresh clone runs with no secret generation. They are public
  placeholders for localhost and must be replaced before any deployment.

### Fixed

- Postgres container crashed on first boot. `POSTGRES_USER=nyanoghar` makes the
  entrypoint create a database of the same name, and `init-databases.sh` then
  ran `CREATE DATABASE "nyanoghar"`, which failed under `ON_ERROR_STOP=1` and
  aborted initialisation before creating the `chat` database.
- `.env` at the repository root was never read. `dotenv` resolves relative to
  the working directory, which pnpm sets to the package being run, so every
  service reported its entire environment as missing. The config package now
  walks up to the nearest `.env`.
- `pnpm db:seed` required `JWT_ACCESS_SECRET` and `REDIS_URL` because it
  imported the full service config. Seeding reference data now needs only
  `DATABASE_URL`.
- Presigned uploads to MinIO failed with 501. Every presigned PUT signs
  `ServerSideEncryption: AES256`, which MinIO rejects unless a KMS key is
  configured; the development container now provides one, so encryption at
  rest is exercised locally exactly as in production.
- Integration tests could not run against a local Postgres — the test helper
  forced `ssl: "require"`, which hosted Postgres needs but the docker-compose
  container does not offer. TLS is now inferred from the host, with
  `?sslmode=` taking precedence.
- A blank `MEDIA_*` value (routine in CI, and in a `.env` with an empty
  assignment) was treated as configured, producing a confusing
  partial-configuration error instead of falling back to the stub driver.

## [0.1.0] - 2026-07-29

Initial pre-release. Not published.

### Added

- `core-api` (Fastify, TypeScript) with the identity, catalog, adoption and
  provider modules, each owning a named Postgres schema.
- Authentication: HS256 access tokens, opaque rotating refresh tokens stored
  only as SHA-256 hashes, reuse detection that revokes the whole session
  family, and Argon2id password hashing at the OWASP baseline.
- Explicit state-machine transition tables for listing and application
  lifecycles, encoding both the legal transitions and who may make them.
- Pet listings with search, and provider profiles with appointment booking.
- Adoption application submission with duplicate and eligibility checks.
- Direct-to-S3 media pipeline: presign, client upload, confirm — with separate
  public and private buckets, and server-minted keys.
- `chat-svc` (Go) skeleton; WebSocket and gRPC handlers return 501.
- Shared packages: `config`, `errors`, `logger`, `auth`, `contracts`.
- CI running lint, typecheck, unit tests and a migration-drift check.

[Unreleased]: https://github.com/nyano-ghar/nyanoghar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nyano-ghar/nyanoghar/releases/tag/v0.1.0
