import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auth,
  buildTestApp,
  cleanup,
  hasDatabase,
  registerUser,
  testSql,
  testTag,
} from "./helpers.js";

describe.skipIf(!hasDatabase)("auth", () => {
  let app: FastifyInstance;
  let sql: ReturnType<typeof testSql>;
  const tag = testTag();

  beforeAll(async () => {
    app = await buildTestApp();
    sql = testSql();
  });

  afterAll(async () => {
    await cleanup(sql, tag);
    await sql.end({ timeout: 5 });
    await app.close();
  });

  it("registers a user and issues a token pair", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `register.${tag}@example.test`,
        password: "Str0ng-Passw0rd!x",
        fullName: "Register Probe",
        acceptedTermsVersion: "2026-01-01",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe(`register.${tag}@example.test`);
    expect(body.user.roles).toContain("ADOPTER");
    expect(body.user.status).toBe("PENDING_VERIFICATION");
    expect(body.tokens.accessToken).toBeTruthy();
    expect(body.tokens.refreshToken).toBeTruthy();
  });

  it("never returns the password hash", async () => {
    const user = await registerUser(app, tag, "nohash");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: auth(user.accessToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("$argon2");
  });

  it("rejects a duplicate email", async () => {
    const user = await registerUser(app, tag, "dupe");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: user.email,
        password: "Str0ng-Passw0rd!x",
        fullName: "Duplicate",
        acceptedTermsVersion: "2026-01-01",
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const user = await registerUser(app, tag, "login");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: user.email, password: "Str0ng-Passw0rd!x" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tokens.accessToken).toBeTruthy();
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const user = await registerUser(app, tag, "timing");

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: user.email, password: "Wr0ng-Passw0rd!x" },
    });
    const unknownAccount = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: `ghost.${tag}@example.test`,
        password: "Wr0ng-Passw0rd!x",
      },
    });

    // Identical status and message, so neither reveals whether the account
    // exists. The dummy-hash in the service equalises timing too.
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(unknownAccount.json().error.message).toBe(
      wrongPassword.json().error.message,
    );
  });

  it("rejects an unauthenticated call to a protected route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/users/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: auth("not-a-real-token"),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rotates the refresh token and revokes the used one", async () => {
    const user = await registerUser(app, tag, "rotate");
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: user.email, password: "Str0ng-Passw0rd!x" },
    });
    const firstRefresh = login.json().tokens.refreshToken;

    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: firstRefresh },
    });
    expect(refreshed.statusCode).toBe(200);
    const secondRefresh = refreshed.json().tokens.refreshToken;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Replaying the rotated token is treated as theft: the session family is
    // revoked, so the new token stops working too.
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: firstRefresh },
    });
    expect(replay.statusCode).toBe(401);

    const afterReplay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: secondRefresh },
    });
    expect(afterReplay.statusCode).toBe(401);
  });

  it("hides contact details on another user's public profile", async () => {
    const user = await registerUser(app, tag, "public");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/users/${user.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(user.id);
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phone");
  });
});
