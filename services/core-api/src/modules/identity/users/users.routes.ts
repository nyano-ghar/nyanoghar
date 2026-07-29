import { Role, roleSchema } from "@nyanoghar/auth";
import { languageSchema, uuidSchema } from "@nyanoghar/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AuthService } from "../auth/auth.service.js";
import { UsersService } from "./users.service.js";

const profileSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  preferredLanguage: languageSchema,
  country: z.string(),
  province: z.string().nullable(),
  district: z.string().nullable(),
  municipality: z.string().nullable(),
  area: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: z.string(),
  roles: z.array(roleSchema),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  createdAt: z.date(),
});

/** Fields another user may see. Contact details stay private. */
const publicProfileSchema = profileSchema.pick({
  id: true,
  fullName: true,
  avatarUrl: true,
  bio: true,
  province: true,
  district: true,
  roles: true,
  createdAt: true,
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  bio: z.string().max(1000).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  preferredLanguage: languageSchema.optional(),
  province: z.string().max(80).nullable().optional(),
  district: z.string().max(80).nullable().optional(),
  municipality: z.string().max(80).nullable().optional(),
  area: z.string().max(160).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

const notificationPrefsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  newApplicationAlerts: z.boolean(),
  messageAlerts: z.boolean(),
  appointmentReminders: z.boolean(),
  marketingEmails: z.boolean(),
});

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  const authService = new AuthService(app.db, app.config);
  const service = new UsersService(app.db);

  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Get the signed-in user's profile",
        response: { 200: profileSchema },
      },
    },
    async (request) => service.getProfile(request.user!.id),
  );

  app.patch(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Update the signed-in user's profile",
        body: updateProfileSchema,
        response: { 200: profileSchema },
      },
    },
    async (request) => service.updateProfile(request.user!.id, request.body),
  );

  app.get(
    "/me/notification-preferences",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Read notification preferences",
        response: { 200: notificationPrefsSchema },
      },
    },
    async (request) => service.getNotificationPreferences(request.user!.id),
  );

  app.patch(
    "/me/notification-preferences",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Update notification preferences",
        body: notificationPrefsSchema.partial(),
        response: { 200: notificationPrefsSchema },
      },
    },
    async (request) =>
      service.updateNotificationPreferences(request.user!.id, request.body),
  );

  app.get(
    "/:userId",
    {
      onRequest: [app.optionalAuth],
      schema: {
        tags: ["users"],
        summary: "Get another user's public profile",
        params: z.object({ userId: uuidSchema }),
        response: { 200: publicProfileSchema },
      },
    },
    async (request) => service.getProfile(request.params.userId),
  );

  app.post(
    "/me/roles",
    {
      onRequest: [app.authenticate, app.requireVerifiedEmail],
      schema: {
        tags: ["users"],
        summary: "Upgrade to a listing or provider role",
        body: z.object({
          role: z.enum([
            Role.PET_OWNER,
            Role.ORGANIZATION,
            Role.VETERINARIAN,
            Role.PET_SHOP,
          ]),
        }),
        response: { 200: z.object({ roles: z.array(roleSchema) }) },
      },
    },
    async (request) => {
      const roles = await authService.grantRole(
        request.user!.id,
        request.body.role,
        request.user!.id,
        { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null },
      );
      return { roles };
    },
  );

  app.post(
    "/:userId/roles",
    {
      onRequest: [app.requireRoles(Role.ADMIN)],
      schema: {
        tags: ["admin"],
        summary: "Grant a role to any user",
        params: z.object({ userId: uuidSchema }),
        body: z.object({ role: roleSchema }),
        response: { 200: z.object({ roles: z.array(roleSchema) }) },
      },
    },
    async (request) => {
      const roles = await authService.grantRole(
        request.params.userId,
        request.body.role,
        request.user!.id,
        { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null },
      );
      return { roles };
    },
  );

  app.delete(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Soft-delete the signed-in account",
        response: { 200: z.object({ message: z.string() }) },
      },
    },
    async (request) => {
      await service.softDelete(request.user!.id, request.user!.roles);
      return { message: "Account scheduled for deletion" };
    },
  );
};
