# Support

Nyanoghar is maintained by a small team. This page explains where to ask, so
your question reaches the right place.

## Setting up the project

Start with [Getting started](README.md#getting-started). A first run needs only
Node 22+, pnpm and Docker — no AWS account, no cloud database, no secrets to
generate.

If something fails, [Common problems](CONTRIBUTING.md#common-problems) in the
contributing guide covers the failures we see most: unbuilt shared packages, a
database that is not running, environment validation errors, and media routes
returning 501.

## Asking a question

Use [GitHub Discussions](https://github.com/nyano-ghar/nyanoghar/discussions)
for questions, setup help, and ideas you want to talk through before writing
code.

Please do not open an issue for a question — issues are for confirmed bugs and
concrete feature requests, and a question filed as an issue tends to sit
unanswered longer.

## Reporting a bug

Open a [bug report](https://github.com/nyano-ghar/nyanoghar/issues/new?template=bug-report.yaml).

The single most useful thing you can include is the `requestId` from the error
response — every error carries one, and it appears in the server logs, so it
turns "something failed" into an exact request.

## Reporting a security vulnerability

**Never in a public issue.** See [SECURITY.md](SECURITY.md) for private
reporting. This project handles authentication, identity documents and health
records, so we take these seriously and respond quickly.

## Requesting a feature

Open a [feature request](https://github.com/nyano-ghar/nyanoghar/issues/new?template=feature-request.yaml).

Check `nyanoghar-backend-project-overview.md` first — it is the product spec and
may already describe what you want. It is a requirements document, not a
description of what is built, so treat it as the source of truth for *intent*
only. §22 is the MVP scope; §23 is explicitly out of scope.

## Wanting to contribute

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the conventions that come up
most in review, and how to run the tests. The
[Known gaps](README.md#known-gaps) list is a good source of starter work.

## What we cannot help with

- Deploying your own fork to production, beyond what the documentation covers
- General TypeScript, Fastify, Drizzle, Go or Postgres questions — their own
  communities will answer far better than we can
- Anything about the mobile or web clients; this repository is the backend
