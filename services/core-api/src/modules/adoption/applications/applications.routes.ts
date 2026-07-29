import { Role } from "@nyanoghar/auth";
import {
  applicationStatusSchema,
  createApplicationSchema,
  uuidSchema,
} from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { rateLimit } from "../../../common/rate-limit.js";
import { ApplicationsService } from "./applications.service.js";

export const applicationRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ApplicationsService(app.db, app.config);

  app.post(
    "/",
    {
      // A verified email is required before an adopter can apply, so owners
      // are not screening anonymous accounts.
      onRequest: [app.authenticate, app.requireVerifiedEmail],
      config: { ...rateLimit(10, "1 hour") },
      schema: {
        tags: ["applications"],
        summary: "Submit an adoption application",
        body: createApplicationSchema,
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const applicantId = request.user!.id;
      await service.assertCanSubmit(applicantId);

      const body = request.body;
      const created = await service.submit(applicantId, body);

      reply.status(201);
      return created;
    },
  );

  app.get(
    "/mine",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["applications"],
        summary: "List applications the caller submitted",
        querystring: z.object({ status: applicationStatusSchema.optional() }),
        response: { 200: z.any() },
      },
    },
    async (request) => service.listForApplicant(request.user!.id, request.query.status),
  );

  app.get(
    "/received",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["applications"],
        summary: "List applications for the caller's listings",
        querystring: z.object({
          status: applicationStatusSchema.optional(),
          petId: uuidSchema.optional(),
        }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.listForOwner(request.user!.id, {
        status: request.query.status,
        petId: request.query.petId,
      }),
  );

  app.get(
    "/:applicationId",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["applications"],
        summary: "Get one application",
        params: z.object({ applicationId: uuidSchema }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.findForViewer(request.params.applicationId, request.user!),
  );

  app.post(
    "/:applicationId/status",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["applications"],
        summary: "Advance an application through its workflow",
        params: z.object({ applicationId: uuidSchema }),
        body: z.object({
          status: applicationStatusSchema,
          note: z.string().max(2000).optional(),
        }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.changeStatus(
        request.params.applicationId,
        request.body.status,
        request.user!.id,
        request.body.note,
      ),
  );

  app.post(
    "/:applicationId/meetings",
    {
      onRequest: [app.requireRoles(Role.PET_OWNER, Role.ORGANIZATION)],
      schema: {
        tags: ["applications"],
        summary: "Propose a meeting or home visit",
        params: z.object({ applicationId: uuidSchema }),
        body: z.object({
          kind: z.enum(["MEET_AND_GREET", "HOME_VISIT", "VIDEO_CALL"]),
          scheduledFor: z.coerce.date(),
          durationMinutes: z.number().int().min(15).max(480).default(60),
          locationText: z.string().max(500).nullable().default(null),
          notes: z.string().max(2000).nullable().default(null),
        }),
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.scheduleMeeting(
        request.params.applicationId,
        request.user!.id,
        request.body,
      );
      reply.status(201);
      return created;
    },
  );
};
