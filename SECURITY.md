# Security Policy

## Supported Versions

Nyanoghar is pre-1.0 and under active development. Security fixes land on
`main`; there are no maintained release branches yet.

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| tagged pre-releases | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Report privately through either:

- **[GitHub private vulnerability reporting](https://github.com/nyano-ghar/nyanoghar/security/advisories/new)**
  (preferred — keeps the report, the fix and the advisory in one place)
- **security@nyanoghar.np**

Please include as much of the following as you can:

- The type of issue (authentication bypass, injection, privilege escalation, …)
- Affected source files, ideally with the tag or commit
- Steps to reproduce, or a proof-of-concept
- What an attacker gains — data disclosure, account takeover, denial of service
- Any suggested mitigation

You will get an acknowledgement within **72 hours** and a fuller assessment
within **7 days**. We will keep you updated as the fix progresses and will
credit you in the advisory unless you ask us not to.

Please give us a reasonable window to ship a fix before public disclosure. We
aim for 90 days, and will usually be much faster.

## Scope

This repository is the backend: the Fastify `core-api` service, the Go
`chat-svc` service, and the shared packages under `packages/`.

### Especially interested in

This platform handles data whose exposure has real consequences for the people
involved:

- **Authentication and session handling** — token rotation and theft detection
  (`auth.service.ts`), password hashing, session revocation
- **Authorization** — the role guards and the state-machine transition tables
  that decide who may act on a listing or an application
- **Private media** — verification documents and health records live in a
  separate bucket, are never CDN-cached, and are served only through
  short-lived signed URLs. Anything that leaks a private object, or lets one
  user read another's, is high severity.
- **Cross-tenant access** — media keys are minted server-side precisely so a
  client cannot write to or confirm another owner's key
- **Personal data exposure** — adopter contact details and precise pet
  locations, which can identify a household
- **SQL injection or ORM misuse** anywhere a filter reaches the database

### Out of scope

- The deliberate development-only credentials in `.env.example` and
  `infra/docker-compose.yml`. These are documented placeholders for localhost;
  see the note in the README. Finding them is not a vulnerability.
- Missing rate limits under `NODE_ENV=test`, which are disabled on purpose so
  the integration suite fails on behaviour rather than throttling.
- Anything requiring a compromised developer machine or physical access.
- Automated scanner output with no demonstrated impact.
- Vulnerabilities in dependencies that we cannot reach from our own code —
  please report those upstream, though we welcome a heads-up.

## Known Gaps

These are already understood and tracked in the README. Reporting them is
welcome but they are not treated as new findings:

- Verification codes are generated and stored but never dispatched.
- EXIF location data is not stripped from images before publishing.
- No error tracking, metrics, or audit-log pipeline is wired in.

## Handling of Secrets

`.env` is gitignored, and the pino logger redacts passwords, tokens, OTPs, ID
numbers and medical notes. If you find a code path that writes any of those to
a log, treat it as a vulnerability and report it privately.
