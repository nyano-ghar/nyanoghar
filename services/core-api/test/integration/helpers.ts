import type { FastifyInstance } from "fastify";
import postgres from "postgres";

/**
 * Integration tests need a real database. Point `TEST_DATABASE_URL` at a
 * throwaway one — a Neon branch is ideal, since it can be reset in seconds.
 *
 * Never point this at production: the cleanup helpers delete rows.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const hasDatabase = Boolean(TEST_DATABASE_URL);

/**
 * Builds the real app, with the config module pointed at the test database.
 *
 * `config` is parsed at import time, so the environment has to be set before
 * `buildApp` is first imported — hence the dynamic import here.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_ACCESS_SECRET ??= "test-secret-at-least-32-characters-long!!";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL ??= "silent";
  // Each test file builds its own app. A serverless Postgres caps total
  // connections, so keep every pool small rather than letting three files
  // open the production default of ten each.
  process.env.DATABASE_POOL_MAX ??= "3";

  const { buildApp } = await import("../../src/app.js");
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Direct SQL handle, for setup and assertions the API does not expose. */
export function testSql() {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  return postgres(TEST_DATABASE_URL, { ssl: "require", max: 2, prepare: false });
}

/**
 * Unique suffix for a test run. Every fixture email embeds it, so concurrent
 * runs against a shared database cannot collide and cleanup can target
 * exactly this run's rows.
 */
export function testTag(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RegisteredUser {
  id: string;
  email: string;
  accessToken: string;
}

/** Registers a user through the real endpoint. */
export async function registerUser(
  app: FastifyInstance,
  tag: string,
  label: string,
): Promise<RegisteredUser> {
  const email = `${label}.${tag}@example.test`;
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email,
      password: "Str0ng-Passw0rd!x",
      fullName: `${label} ${tag}`,
      acceptedTermsVersion: "2026-01-01",
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`register failed (${response.statusCode}): ${response.body}`);
  }

  const body = response.json();
  return {
    id: body.user.id,
    email,
    accessToken: body.tokens.accessToken,
  };
}

/**
 * Marks an account verified and re-issues a token.
 *
 * Several routes sit behind `requireVerifiedEmail`, and the verification code
 * is never dispatched (no email provider is wired in), so tests flip the
 * column directly and log in again to get a token carrying the new claim.
 */
export async function verifyEmail(
  app: FastifyInstance,
  sql: ReturnType<typeof testSql>,
  user: RegisteredUser,
): Promise<string> {
  await sql`
    update identity.users
    set email_verified_at = now(), status = 'ACTIVE'
    where id = ${user.id}`;

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: user.email, password: "Str0ng-Passw0rd!x" },
  });

  return response.json().tokens.accessToken;
}

export async function grantRole(
  sql: ReturnType<typeof testSql>,
  userId: string,
  role: string,
): Promise<void> {
  await sql`
    insert into identity.user_roles (user_id, role)
    values (${userId}, ${role}::role)
    on conflict do nothing`;
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Removes every row this run created, in FK-safe order. */
export async function cleanup(
  sql: ReturnType<typeof testSql>,
  tag: string,
): Promise<void> {
  const pattern = `%${tag}@example.test`;
  await sql`
    delete from adoption.applications
    where applicant_id in (select id from identity.users where email like ${pattern})
       or owner_id in (select id from identity.users where email like ${pattern})`;
  await sql`
    delete from catalog.pets
    where owner_id in (select id from identity.users where email like ${pattern})`;
  await sql`
    delete from provider.providers
    where owner_id in (select id from identity.users where email like ${pattern})`;
  await sql`delete from identity.users where email like ${pattern}`;
}
