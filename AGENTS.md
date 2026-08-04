# Nyanoghar

Pet adoption and pet-care backend for Nepal. Fastify + TypeScript (`core-api`)
for everything transactional; Go (`chat-svc`) for real-time chat.

## Constraints

- **Routes never touch the database.** Every query lives in
  `<module>.service.ts`. The only legitimate `app.db` in a route file is the
  service constructor.
- **A Drizzle `many()` needs its inverse `one()` in the same commit.** A
  missing inverse is not a type error — it throws at query time. This has
  shipped broken three times.
- **New tables use the module's schema object** (`catalogSchema.table(...)`),
  never a bare `pgTable` — that silently lands them in `public`.
- **Migrations are generated, not written.** Change `src/db/schema/`, then run
  `pnpm db:generate` and commit the result. CI fails on drift.
- **`console.*` is a lint error** — it bypasses secret redaction. Use
  `app.log` / `request.log`.
- **The five `MEDIA_*` S3 settings are all-or-nothing.** All of them, or none
  (which selects the stub driver and returns 501 on upload). A partial set is
  rejected at startup on purpose — do not "fix" that by adding defaults.
- **Never commit `.env`.** The credentials in `.env.example` and
  `docker-compose.yml` are deliberate localhost-only placeholders.
- **No per-file licence headers.** The root `LICENSE` and `NOTICE` cover the
  repository.

## Commands

```
pnpm install && pnpm infra:up && pnpm setup    # first run; needs only Docker
pnpm dev                                       # http://localhost:4000/docs
pnpm lint && pnpm typecheck && pnpm test       # what CI runs
pnpm db:generate                               # after any schema change
pnpm infra:up:media                            # + MinIO, to work on uploads
```

Integration tests need a database:
`TEST_DATABASE_URL='postgres://nyanoghar:nyanoghar@localhost:5432/nyanoghar' pnpm test:integration`

## Commits

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):
`type(scope): description`, imperative and lowercase, no trailing period.

- Types: `feat` `fix` `docs` `refactor` `test` `chore` `build` `ci` `perf`
  `style` `revert`
- Scopes: `identity` `catalog` `adoption` `provider` `chat` `media` `config`
  `infra` `deps`
- Breaking: `!` before the colon, or a `BREAKING CHANGE:` footer (uppercase).

```
feat(catalog): add breed filter to pet search
fix(identity): revoke session family on refresh token reuse
feat(media)!: store bucket and key instead of a URL
```

## Style

- Errors: throw a typed error from `@nyanoghar/errors`. Never leak internals.
- Validation: Zod at the boundary; shared shapes in `@nyanoghar/contracts`.
- Lifecycles are transition tables, not `if` chains. Extend the table.
- Comments explain *why*, not *what*.
- User-visible change? Add a line under `## [Unreleased]` in `CHANGELOG.md`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and review conventions.
