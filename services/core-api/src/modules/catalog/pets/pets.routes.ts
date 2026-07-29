import { Role } from "@nyanoghar/auth";
import {
  createPetSchema,
  listingStatusSchema,
  petSearchSchema,
  updatePetSchema,
  uuidSchema,
} from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { PetsService } from "./pets.service.js";

/** Response shape is intentionally loose while the read model settles. */
const petResponseSchema = z.any();

export const petRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new PetsService(app.db, app.config);

  const isModerator = (roles: string[]) =>
    roles.includes(Role.MODERATOR) || roles.includes(Role.ADMIN);

  app.get(
    "/",
    {
      onRequest: [app.optionalAuth],
      schema: {
        tags: ["pets"],
        summary: "Search published pet listings",
        querystring: petSearchSchema.and(
          z.object({
            page: z.coerce.number().int().min(1).default(1),
            perPage: z.coerce.number().int().min(1).max(50).default(20),
          }),
        ),
        response: { 200: z.any() },
      },
    },
    async (request) => service.search(request.query),
  );

  app.get(
    "/:petId",
    {
      onRequest: [app.optionalAuth],
      schema: {
        tags: ["pets"],
        summary: "Get one listing",
        params: z.object({ petId: uuidSchema }),
        response: { 200: petResponseSchema },
      },
    },
    async (request) =>
      service.findForViewer(request.params.petId, request.user, (error) => {
        request.log.warn({ err: error }, "failed to increment view count");
      }),
  );

  app.post(
    "/",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "Create a draft listing",
        body: createPetSchema,
        response: { 201: petResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await service.create(request.user!.id, request.body);
      reply.status(201);
      return created;
    },
  );

  app.patch(
    "/:petId",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "Update a listing",
        params: z.object({ petId: uuidSchema }),
        body: updatePetSchema,
        response: { 200: petResponseSchema },
      },
    },
    async (request) => service.update(request.params.petId, request.user!.id),
  );

  app.post(
    "/:petId/status",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["pets"],
        summary: "Move a listing through its lifecycle",
        params: z.object({ petId: uuidSchema }),
        body: z.object({
          status: listingStatusSchema,
          reason: z.string().max(1000).optional(),
        }),
        response: { 200: petResponseSchema },
      },
    },
    async (request) =>
      service.changeStatus(
        request.params.petId,
        request.body.status,
        request.user!.id,
        isModerator(request.user!.roles),
        request.body.reason,
      ),
  );

  app.post(
    "/:petId/favorite",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["pets"],
        summary: "Save a listing to favourites",
        params: z.object({ petId: uuidSchema }),
        response: { 200: z.object({ favorited: z.boolean() }) },
      },
    },
    async (request) => service.addFavorite(request.user!.id, request.params.petId),
  );

  app.delete(
    "/:petId/favorite",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["pets"],
        summary: "Remove a listing from favourites",
        params: z.object({ petId: uuidSchema }),
        response: { 200: z.object({ favorited: z.boolean() }) },
      },
    },
    async (request) => service.removeFavorite(request.user!.id, request.params.petId),
  );

  app.post(
    "/:petId/media",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "Attach media to a listing",
        params: z.object({ petId: uuidSchema }),
        body: z.object({
          kind: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]).default("IMAGE"),
          url: z.string().url(),
          thumbnailUrl: z.string().url().nullable().default(null),
          position: z.number().int().nonnegative().default(0),
          isPrivate: z.boolean().default(false),
        }),
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.addMedia(
        request.params.petId,
        request.user!.id,
        request.body,
      );
      reply.status(201);
      return created;
    },
  );

  app.get(
    "/me/listings",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "List the caller's own listings, any status",
        querystring: z.object({ status: listingStatusSchema.optional() }),
        response: { 200: z.any() },
      },
    },
    async (request) => service.listOwn(request.user!.id, request.query.status),
  );
};
