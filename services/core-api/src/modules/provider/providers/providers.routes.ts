import { Role } from "@nyanoghar/auth";
import {
  createProviderSchema,
  providerSearchSchema,
  uuidSchema,
} from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ProvidersService } from "./providers.service.js";

const serviceCategorySchema = z.enum([
  "CONSULTATION",
  "VACCINATION",
  "SURGERY",
  "DIAGNOSTICS",
  "GROOMING",
  "BOARDING",
  "TRAINING",
  "EMERGENCY",
  "OTHER",
]);

export const providerRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new ProvidersService(app.db);

  app.get(
    "/",
    {
      schema: {
        tags: ["providers"],
        summary: "Find vets and pet shops",
        querystring: providerSearchSchema.and(
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
    "/:providerId",
    {
      schema: {
        tags: ["providers"],
        summary: "Get a provider profile with services and hours",
        params: z.object({ providerId: uuidSchema }),
        response: { 200: z.any() },
      },
    },
    async (request) => service.findById(request.params.providerId),
  );

  app.post(
    "/",
    {
      onRequest: [
        app.requireRoles(Role.VETERINARIAN, Role.PET_SHOP),
        app.requireVerifiedEmail,
      ],
      schema: {
        tags: ["providers"],
        summary: "Create a business profile",
        body: createProviderSchema,
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.create(request.user!.id, request.body);
      reply.status(201);
      return created;
    },
  );

  app.post(
    "/:providerId/services",
    {
      onRequest: [app.requireRoles(Role.VETERINARIAN, Role.PET_SHOP)],
      schema: {
        tags: ["providers"],
        summary: "Add a service",
        params: z.object({ providerId: uuidSchema }),
        body: z.object({
          name: z.string().min(2).max(120),
          category: serviceCategorySchema,
          description: z.string().max(2000).nullable().default(null),
          priceMin: z.number().nonnegative().nullable().default(null),
          priceMax: z.number().nonnegative().nullable().default(null),
          currency: z.string().length(3).default("NPR"),
          durationMinutes: z.number().int().min(5).max(600).nullable().default(null),
        }),
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.addService(
        request.params.providerId,
        request.user!.id,
        request.body,
      );
      reply.status(201);
      return created;
    },
  );

  app.post(
    "/:providerId/verification",
    {
      onRequest: [app.requireRoles(Role.VETERINARIAN, Role.PET_SHOP)],
      schema: {
        tags: ["providers"],
        summary: "Submit documents for verification",
        params: z.object({ providerId: uuidSchema }),
        body: z.object({
          documents: z
            .array(
              z.object({
                documentType: z.string().min(2).max(80),
                url: z.string().url(),
              }),
            )
            .min(1)
            .max(10),
        }),
        response: { 202: z.any() },
      },
    },
    async (request, reply) => {
      const result = await service.submitVerification(
        request.params.providerId,
        request.user!.id,
        request.body.documents,
      );
      reply.status(202);
      return result;
    },
  );

  app.post(
    "/:providerId/verification/decision",
    {
      onRequest: [app.requireRoles(Role.MODERATOR, Role.ADMIN)],
      schema: {
        tags: ["admin"],
        summary: "Approve or reject a provider",
        params: z.object({ providerId: uuidSchema }),
        body: z.object({
          decision: z.enum(["VERIFIED", "REJECTED"]),
          reason: z.string().max(1000).optional(),
        }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.decideVerification(
        request.params.providerId,
        request.user!.id,
        request.body.decision,
        request.body.reason,
      ),
  );
};
