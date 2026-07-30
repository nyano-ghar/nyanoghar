import { Role } from "@nyanoghar/auth";
import {
  confirmUploadSchema,
  createUploadUrlSchema,
  mediaItemSchema,
  uploadTicketSchema,
  uuidSchema,
} from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { MediaStorage } from "../../../lib/media/storage.js";
import { MediaService } from "./media.service.js";

/**
 * Direct-to-S3 media upload for pet listings.
 *
 * Mounted under /api/v1/pets/:petId/media. Bytes never reach this service, so
 * these routes only hand out narrowly-scoped presigned URLs and record the
 * result.
 */
export const mediaRoutes: FastifyPluginAsyncZod = async (app) => {
  const storage = new MediaStorage(app.config);
  const service = new MediaService(app.db, app.config, storage);

  app.addHook("onClose", async () => {
    await storage.close();
  });

  app.post(
    "/:petId/media/upload-url",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      // Signing is cheap but not free, and each URL authorizes a write to the
      // bucket. Bound it well below the global limit.
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["pets"],
        summary: "Request a presigned URL for a direct S3 upload",
        description:
          "Returns a short-lived PUT URL for a server-chosen key. Send the " +
          "returned headers verbatim, then POST to /media/confirm.",
        params: z.object({ petId: uuidSchema }),
        body: createUploadUrlSchema,
        response: { 201: uploadTicketSchema },
      },
    },
    async (request, reply) => {
      const ticket = await service.createUploadUrl(
        request.params.petId,
        request.user!.id,
        request.body,
      );
      reply.status(201);
      return ticket;
    },
  );

  app.post(
    "/:petId/media/confirm",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "Record a completed upload",
        params: z.object({ petId: uuidSchema }),
        body: confirmUploadSchema,
        response: { 201: mediaItemSchema },
      },
    },
    async (request, reply) => {
      const created = await service.confirmUpload(
        request.params.petId,
        request.user!.id,
        request.body,
      );
      reply.status(201);
      return created;
    },
  );

  app.get(
    "/:petId/media",
    {
      // Optional auth: the owner additionally sees private documents, as
      // signed GETs rather than CDN URLs.
      onRequest: [app.optionalAuth],
      schema: {
        tags: ["pets"],
        summary: "List a listing's media",
        params: z.object({ petId: uuidSchema }),
        response: { 200: z.array(mediaItemSchema) },
      },
    },
    async (request) => service.listForPet(request.params.petId, request.user?.id),
  );

  app.delete(
    "/:petId/media/:mediaId",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["pets"],
        summary: "Detach media from a listing",
        params: z.object({ petId: uuidSchema, mediaId: uuidSchema }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.remove(
        request.params.petId,
        request.user!.id,
        request.params.mediaId,
      );
      reply.status(204);
      return null;
    },
  );
};
