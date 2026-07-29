import { Role } from "@nyanoghar/auth";
import { createAppointmentSchema, uuidSchema } from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { rateLimit } from "../../../common/rate-limit.js";
import { AppointmentsService } from "./appointments.service.js";

export const appointmentRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AppointmentsService(app.db, app.config);

  app.post(
    "/",
    {
      onRequest: [app.authenticate],
      config: { ...rateLimit(20, "1 hour") },
      schema: {
        tags: ["appointments"],
        summary: "Request an appointment",
        body: createAppointmentSchema,
        response: { 201: z.any() },
      },
    },
    async (request, reply) => {
      const created = await service.request(request.user!.id, request.body);
      reply.status(201);
      return created;
    },
  );

  app.get(
    "/mine",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["appointments"],
        summary: "List the caller's appointments",
        response: { 200: z.any() },
      },
    },
    async (request) => service.listForCustomer(request.user!.id),
  );

  app.get(
    "/provider/:providerId",
    {
      onRequest: [app.requireRoles(Role.VETERINARIAN, Role.PET_SHOP)],
      schema: {
        tags: ["appointments"],
        summary: "List appointments for a provider the caller owns",
        params: z.object({ providerId: uuidSchema }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.listForProvider(request.params.providerId, request.user!.id),
  );

  app.post(
    "/:appointmentId/status",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["appointments"],
        summary: "Confirm, reschedule, complete or cancel an appointment",
        params: z.object({ appointmentId: uuidSchema }),
        body: z.object({
          status: z.enum([
            "CONFIRMED",
            "RESCHEDULED",
            "CANCELLED",
            "COMPLETED",
            "NO_SHOW",
          ]),
          confirmedFor: z.coerce.date().optional(),
          reason: z.string().max(1000).optional(),
        }),
        response: { 200: z.any() },
      },
    },
    async (request) =>
      service.changeStatus(
        request.params.appointmentId,
        request.user!.id,
        request.body.status,
        {
          confirmedFor: request.body.confirmedFor,
          reason: request.body.reason,
        },
      ),
  );
};
