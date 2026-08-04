# Contributing to Nyanoghar

Thanks for taking a look. This is the backend for a pet adoption and pet-care
platform for Nepal.

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By taking part
you agree to uphold it.

Not sure where something belongs? [SUPPORT.md](SUPPORT.md) explains which
channel to use for questions, bugs, and feature requests.

## Getting set up

See [Getting started](README.md#getting-started) in the README. The short
version, which needs only Node 22+, pnpm and Docker:

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm setup
pnpm dev
```

You do **not** need an AWS account, a cloud database, or any credentials of
your own. If a first run fails for you, that is a bug in our setup — please
open an issue.

### Common problems

**`Cannot find module '@nyanoghar/contracts'`** — the shared packages have not
been built. `core-api` imports their compiled output, so run
`pnpm --filter "./packages/**" build` (part of `pnpm setup`).

**`ECONNREFUSED localhost:5432`** — Postgres is not up. `pnpm infra:up`, then
`docker compose -f infra/docker-compose.yml ps` to confirm it is healthy.

**`Invalid environment configuration`** — the server validates its whole
environment at startup and prints exactly which variables are wrong. Compare
your `.env` against `.env.example`.

**Media routes return 501** — expected without storage configured. To work on
media, run `pnpm infra:up:media` (Postgres + MinIO) and uncomment the MinIO
block in your `.env`; uploads then work end to end with no AWS account. See
[Working on media](README.md#working-on-media-no-aws-account-needed).

**Port 4000 or 5432 already in use** — override `PORT` or `POSTGRES_PORT` in
`.env`.

## Before you open a pull request

CI runs these on every push, so run them locally first:

```bash
pnpm lint         # biome; `pnpm lint:fix` writes fixes
pnpm typecheck    # all 6 projects
pnpm test         # unit tests, no database needed
```

If you changed anything under `src/db/schema/`, regenerate the migration and
commit it — CI fails on drift between schema and migrations:

```bash
pnpm db:generate
```

Integration tests need a real Postgres and write and delete rows, so point
them at a throwaway database — your local Docker one is fine:

```bash
cd services/core-api
TEST_DATABASE_URL='postgres://nyanoghar:nyanoghar@localhost:5432/nyanoghar' pnpm test:integration
```

All 26 pass against the docker-compose database; no cloud account is needed.
TLS is inferred from the host, so the same command works unchanged against a
Neon branch.

## Conventions worth knowing

[AGENTS.md](AGENTS.md) has the condensed version, useful whether you are
working by hand or with a coding agent. These are the ones that most often come
up in review.

**Routes validate and delegate; services do the work.** Every database call
lives in `<module>.service.ts`. A route touching `app.db` directly is a smell —
the only legitimate one is the service constructor. This is what makes the
logic testable without booting HTTP.

**Module boundaries.** `identity`, `catalog`, `adoption` and `provider` are
modules in one process, each owning a named Postgres schema. A module reads and
writes its own schema; reaching across is allowed only where the domain
genuinely requires it, and should stay a read.

**Adding a table?** Use the module's schema object
(`catalogSchema.table(...)`), not a bare `pgTable` — the latter silently lands
it in `public`.

**Adding a Drizzle `many()` relation?** Add the inverse `one()` in the same
commit. A missing inverse is not a type error; it throws at query time.

**Errors.** Throw a typed error from `@nyanoghar/errors`. Unknown errors become
a generic 500 so internals never leak.

**State machines.** Listing and application lifecycles are explicit transition
tables that also encode *who* may make each move. Extend the table; do not add
branching around it.

**Logging.** Use `app.log` / `request.log`. `console.*` is a lint error because
it bypasses secret redaction. Never log raw request bodies on auth routes.

## Security

The auth implementation has properties that are easy to break by accident:
refresh-token rotation with theft detection, Argon2id hashing, and a dummy hash
on failed login so timing does not reveal which accounts exist. If you are
changing `auth.service.ts`, please read the surrounding comments first.

Please do not report security vulnerabilities in a public issue. See
[SECURITY.md](SECURITY.md) for private reporting.

**Never commit real credentials.** The values in `.env.example` and
`docker-compose.yml` are deliberate development-only placeholders; `.env`
itself is gitignored.

## Commit messages

This project uses [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
type(optional scope): description

optional body

optional footers
```

- **Types:** `feat` `fix` `docs` `refactor` `test` `chore` `build` `ci` `perf`
  `style` `revert`
- **Scopes:** `identity` `catalog` `adoption` `provider` `chat` `media`
  `config` `infra` `deps`
- **Description:** imperative, lowercase, no trailing period —
  "add breed filter", not "Added breed filter."
- **Breaking changes:** put `!` before the colon, or add a
  `BREAKING CHANGE: <what broke>` footer. `BREAKING CHANGE` must be uppercase.

```
feat(catalog): add breed filter to pet search
fix(identity): revoke session family on refresh token reuse
docs: document the MinIO setup for local media
feat(media)!: store bucket and key instead of a URL

BREAKING CHANGE: pet_media rows now hold `bucket` + `key`; clients must
read `url` from the API rather than building it themselves.
```

`feat` implies a MINOR release, `fix` a PATCH, and a breaking change a MAJOR
one. Keeping the history machine-readable is also what lets the changelog be
assembled reliably.

## Changelog

If your change is something a user or an operator would notice — a new
endpoint, a changed response, a new required environment variable, a security
fix — add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the
same PR. Purely internal refactors do not need one.

Write for someone upgrading, not for someone reading the diff: say what changed
and what they have to do about it.

## Scope

`nyanoghar-backend-project-overview.md` is the product spec — it describes the
full long-term platform, not what is built. Treat it as the source of truth for
*intent*, never for *status*. Build against §22 (the MVP list) unless an issue
says otherwise; §23 is explicitly out of scope.

The README's [Known gaps](README.md#known-gaps) list is a good source of
starter work.

## Licensing

Nyanoghar is licensed under the [Apache License 2.0](LICENSE). Contributions are
accepted under the same licence.

There is no CLA. Under Apache 2.0 §5, anything you deliberately submit for
inclusion is licensed to the project under those terms, with no extra paperwork.

Source files do not carry per-file licence headers — the root `LICENSE` and
`NOTICE` cover the repository. If you add third-party code, keep its original
copyright notice and licence intact, and mention it in `NOTICE` if its licence
requires attribution. Do not add code whose licence is incompatible with
Apache 2.0 (GPL and AGPL are not).
