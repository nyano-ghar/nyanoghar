import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auth,
  buildTestApp,
  cleanup,
  hasDatabase,
  type RegisteredUser,
  registerUser,
  testSql,
  testTag,
  verifyEmail,
} from "./helpers.js";

const household = {
  housingType: "HOUSE",
  ownsHome: true,
  hasYard: true,
  householdSize: 3,
  hasChildren: false,
  youngestChildAge: null,
  existingPets: null,
  hoursAlonePerDay: 4,
  previousPetExperience: "Grew up with two dogs.",
};

const message =
  "I would love to give this pet a home. We have a large fenced yard and prior experience.";

describe.skipIf(!hasDatabase)("adoption applications", () => {
  let app: FastifyInstance;
  let sql: ReturnType<typeof testSql>;
  const tag = testTag();

  let owner: RegisteredUser;
  let adopterToken: string;
  let speciesId: string;
  let publishedPetId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    sql = testSql();

    owner = await registerUser(app, tag, "owner");
    const adopter = await registerUser(app, tag, "adopter");
    adopterToken = await verifyEmail(app, sql, adopter);

    const existing = await sql`select id from catalog.species where slug = 'dog'`;
    if (existing.length > 0) {
      speciesId = existing[0].id;
    } else {
      const [created] = await sql`
        insert into catalog.species (slug, name_en, name_ne)
        values ('dog', 'Dog', 'कुकुर') returning id`;
      speciesId = created.id;
    }

    const [pet] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, published_at, province, district)
      values
        (${owner.id}, ${speciesId}, 'Kalu', 'MALE', 'MEDIUM',
         'A friendly street dog looking for a home.', 'PUBLISHED', now(), 'Bagmati', 'Kathmandu')
      returning id`;
    publishedPetId = pet.id;
  });

  afterAll(async () => {
    await cleanup(sql, tag);
    await sql.end({ timeout: 5 });
    await app.close();
  });

  it("accepts an application and resolves the owner from the catalog", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(adopterToken),
      payload: {
        petId: publishedPetId,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("SUBMITTED");
    // Denormalised at submission time from catalog.pets — this is the
    // cross-schema read that replaced the old inter-service HTTP call.
    expect(body.ownerId).toBe(owner.id);
    expect(body.petName).toBe("Kalu");
  });

  it("writes an audit history row", async () => {
    const applicant = await registerUser(app, tag, "historyapplicant");
    const token = await verifyEmail(app, sql, applicant);
    const [pet] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, published_at, province, district)
      values
        (${owner.id}, ${speciesId}, 'History Pet', 'MALE', 'SMALL',
         'Used to check that submission writes an audit trail row.', 'PUBLISHED', now(), 'Bagmati', 'Kathmandu')
      returning id`;

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(token),
      payload: {
        petId: pet.id,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });
    expect(submitted.statusCode).toBe(201);

    const rows = await sql`
      select to_status, changed_by
      from adoption.application_status_history
      where application_id = ${submitted.json().id}`;

    expect(rows).toHaveLength(1);
    expect(rows[0].to_status).toBe("SUBMITTED");
    expect(rows[0].changed_by).toBe(applicant.id);
  });

  it("rejects a second open application for the same pet", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(adopterToken),
      payload: {
        petId: publishedPetId,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("UNPROCESSABLE");
  });

  it("rejects an application to a listing that is not published", async () => {
    const [paused] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, province, district)
      values
        (${owner.id}, ${speciesId}, 'Paused Pet', 'FEMALE', 'SMALL',
         'This listing is paused and must not accept applications.', 'PAUSED', 'Bagmati', 'Lalitpur')
      returning id`;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(adopterToken),
      payload: {
        petId: paused.id,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it("returns 404 for a listing that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(adopterToken),
      payload: {
        petId: "00000000-0000-0000-0000-000000000000",
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("stops an owner applying to their own listing", async () => {
    const ownerToken = await verifyEmail(app, sql, owner);
    const [own] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, published_at, province, district)
      values
        (${owner.id}, ${speciesId}, 'Own Pet', 'MALE', 'LARGE',
         'The owner of this listing must not be able to apply for it.', 'PUBLISHED', now(), 'Bagmati', 'Bhaktapur')
      returning id`;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(ownerToken),
      payload: {
        petId: own.id,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      payload: {
        petId: publishedPetId,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("hides an application from someone who is not a party to it", async () => {
    const stranger = await registerUser(app, tag, "stranger");
    const strangerToken = await verifyEmail(app, sql, stranger);

    // Create the application this test needs rather than depending on one an
    // earlier test happened to leave behind.
    const applicant = await registerUser(app, tag, "privateapplicant");
    const applicantToken = await verifyEmail(app, sql, applicant);
    const [pet] = await sql`
      insert into catalog.pets
        (owner_id, species_id, name, sex, size, description, status, published_at, province, district)
      values
        (${owner.id}, ${speciesId}, 'Private Pet', 'FEMALE', 'MEDIUM',
         'Used to check that a stranger cannot read the application.', 'PUBLISHED', now(), 'Bagmati', 'Kathmandu')
      returning id`;

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: auth(applicantToken),
      payload: {
        petId: pet.id,
        message,
        household,
        customAnswers: {},
        documentIds: [],
      },
    });
    expect(submitted.statusCode).toBe(201);
    const applicationId = submitted.json().id;

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}`,
      headers: auth(strangerToken),
    });

    // Applications carry household details, so only the two parties and
    // moderators may read one.
    expect(response.statusCode).toBe(403);

    // The applicant themselves must still be able to read it.
    const asApplicant = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}`,
      headers: auth(applicantToken),
    });
    expect(asApplicant.statusCode).toBe(200);
  });
});
