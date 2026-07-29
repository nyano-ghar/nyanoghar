import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auth,
  buildTestApp,
  cleanup,
  grantRole,
  hasDatabase,
  type RegisteredUser,
  registerUser,
  testSql,
  testTag,
  verifyEmail,
} from "./helpers.js";

describe.skipIf(!hasDatabase)("catalog", () => {
  let app: FastifyInstance;
  let sql: ReturnType<typeof testSql>;
  const tag = testTag();

  let owner: RegisteredUser;
  let ownerToken: string;
  let speciesId: string;
  let publishedPetId: string;
  let draftPetId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    sql = testSql();

    owner = await registerUser(app, tag, "catalogowner");
    await grantRole(sql, owner.id, "PET_OWNER");
    ownerToken = await verifyEmail(app, sql, owner);

    const existing = await sql`select id from catalog.species where slug = 'dog'`;
    speciesId =
      existing.length > 0
        ? existing[0].id
        : (
            await sql`insert into catalog.species (slug, name_en, name_ne)
                      values ('dog', 'Dog', 'कुकुर') returning id`
          )[0].id;

    const [published] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, published_at, province, district)
      values
        (${owner.id}, ${speciesId}, 'Findable', 'MALE', 'MEDIUM',
         'A published listing that discovery search must return.', 'PUBLISHED', now(), 'Bagmati', 'Kathmandu')
      returning id`;
    publishedPetId = published.id;

    const [draft] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, province, district)
      values
        (${owner.id}, ${speciesId}, 'Hidden Draft', 'FEMALE', 'SMALL',
         'A draft listing that must never appear in public discovery.', 'DRAFT', 'Bagmati', 'Lalitpur')
      returning id`;
    draftPetId = draft.id;
  });

  afterAll(async () => {
    await cleanup(sql, tag);
    await sql.end({ timeout: 5 });
    await app.close();
  });

  it("lists species without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reference/species",
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it("returns a paginated envelope from search", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/pets?perPage=5" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("data");
    expect(body.meta).toMatchObject({ page: 1, perPage: 5 });
    expect(typeof body.meta.total).toBe("number");
  });

  it("excludes unpublished listings from public search", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pets?perPage=50",
    });
    const ids = response.json().data.map((pet: { id: string }) => pet.id);

    expect(ids).toContain(publishedPetId);
    expect(ids).not.toContain(draftPetId);
  });

  it("returns a published listing to an anonymous caller", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/pets/${publishedPetId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Findable");
  });

  it("reports someone else's draft as missing, not forbidden", async () => {
    const stranger = await registerUser(app, tag, "peeker");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/pets/${draftPetId}`,
      headers: auth(stranger.accessToken),
    });

    // 404 rather than 403: confirming the draft exists would leak it.
    expect(response.statusCode).toBe(404);
  });

  it("shows the owner their own draft", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/pets/${draftPetId}`,
      headers: auth(ownerToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Hidden Draft");
  });

  it("refuses listing creation without the PET_OWNER role", async () => {
    const adopter = await registerUser(app, tag, "adopteronly");
    const token = await verifyEmail(app, sql, adopter);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pets",
      headers: auth(token),
      payload: {
        name: "Should Fail",
        speciesId,
        sex: "MALE",
        size: "MEDIUM",
        description: "An adopter without the owner role must not create listings.",
        location: { country: "NP", province: "Bagmati", district: "Kathmandu" },
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("adds and removes a favourite, moving the counter once", async () => {
    const fan = await registerUser(app, tag, "fan");
    const token = await verifyEmail(app, sql, fan);

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/pets/${publishedPetId}/favorite`,
      headers: auth(token),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().favorited).toBe(true);

    // Favouriting twice must not inflate the denormalised counter.
    await app.inject({
      method: "POST",
      url: `/api/v1/pets/${publishedPetId}/favorite`,
      headers: auth(token),
    });

    const [afterAdd] = await sql`
      select favorite_count from catalog.pets where id = ${publishedPetId}`;
    expect(Number(afterAdd.favorite_count)).toBe(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/pets/${publishedPetId}/favorite`,
      headers: auth(token),
    });
    expect(removed.json().favorited).toBe(false);

    const [afterRemove] = await sql`
      select favorite_count from catalog.pets where id = ${publishedPetId}`;
    expect(Number(afterRemove.favorite_count)).toBe(0);
  });

  it("rejects an illegal listing transition", async () => {
    // DRAFT cannot jump straight to ADOPTED.
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/pets/${draftPetId}/status`,
      headers: auth(ownerToken),
      payload: { status: "ADOPTED" },
    });

    expect(response.statusCode).toBe(422);
  });
});
