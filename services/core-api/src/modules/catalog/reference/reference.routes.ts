import { Role } from "@nyanoghar/auth";
import { uuidSchema } from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ReferenceService } from "./reference.service.js";

/**
 * Species and breed reference data. Reads are public and heavily cached;
 * writes are admin-only (spec §6.6).
 */
export const referenceRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ReferenceService(app.db);

  app.get(
    "/species",
    {
      schema: {
        tags: ["reference"],
        summary: "List species",
        response: { 200: z.any() },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "public, max-age=3600");
      return service.listSpecies();
    },
  );

  app.get(
    "/species/:speciesId/breeds",
    {
      schema: {
        tags: ["reference"],
        summary: "List breeds for a species",
        params: z.object({ speciesId: uuidSchema }),
        response: { 200: z.any() },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "public, max-age=3600");
      return service.listBreeds(request.params.speciesId);
    },
  );

  app.post(
    "/species",
    {
      onRequest: [app.requireRoles(Role.ADMIN)],
      schema: {
        tags: ["admin"],
        summary: "Create a species",
        body: z.object({
          slug: z.string().min(2).max(60),
          nameEn: z.string().min(2).max(80),
          nameNe: z.string().max(80).nullable().default(null),
        }),
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.createSpecies(request.body);
      reply.status(201);
      return created;
    },
  );

  app.post(
    "/breeds",
    {
      onRequest: [app.requireRoles(Role.ADMIN)],
      schema: {
        tags: ["admin"],
        summary: "Create a breed",
        body: z.object({
          speciesId: uuidSchema,
          slug: z.string().min(2).max(60),
          nameEn: z.string().min(2).max(80),
          nameNe: z.string().max(80).nullable().default(null),
        }),
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.createBreed(request.body);
      reply.status(201);
      return created;
    },
  );
};
