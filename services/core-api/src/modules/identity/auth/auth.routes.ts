import { UnauthorizedError } from "@nyanoghar/errors";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { rateLimit } from "../../../common/rate-limit.js";
import {
  authResponseSchema,
  changePasswordBodySchema,
  confirmVerificationBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  messageResponseSchema,
  refreshBodySchema,
  registerBodySchema,
  requestVerificationBodySchema,
  resetPasswordBodySchema,
  sessionSummarySchema,
} from "./auth.schema.js";
import { AuthService, type RequestContext } from "./auth.service.js";

function contextOf(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): RequestContext {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new AuthService(app.db, app.config);

  app.post(
    "/register",
    {
      config: {
        // Registration is a prime target for scripted abuse.
        ...rateLimit(5, "10 minutes"),
      },
      schema: {
        tags: ["auth"],
        summary: "Create an account",
        body: registerBodySchema,
        response: { 201: authResponseSchema, 409: z.any() },
      },
    },
    async (request, reply) => {
      const result = await service.register(
        request.body,
        {
          deviceId: request.body.deviceId,
          deviceName: request.body.deviceName,
          devicePlatform: request.body.devicePlatform,
        },
        contextOf(request),
      );

      // TODO(notifications): publish identity.user.registered so the
      // notification service dispatches the verification email/SMS.
      reply.status(201);
      return result;
    },
  );

  app.post(
    "/login",
    {
      config: { ...rateLimit(10, "5 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Sign in with email or phone",
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request) =>
      service.login(
        request.body,
        {
          deviceId: request.body.deviceId,
          deviceName: request.body.deviceName,
          devicePlatform: request.body.devicePlatform,
        },
        contextOf(request),
      ),
  );

  app.post(
    "/refresh",
    {
      config: { ...rateLimit(30, "5 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Exchange a refresh token for a new token pair",
        body: refreshBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request) =>
      service.refresh(
        request.body.refreshToken,
        { devicePlatform: "UNKNOWN" },
        contextOf(request),
      ),
  );

  app.post(
    "/logout",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Revoke the current session, or every session",
        body: logoutBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.logout(
        request.user!.id,
        {
          refreshToken: request.body.refreshToken,
          allDevices: request.body.allDevices,
        },
        contextOf(request),
      );
      return { message: "Signed out" };
    },
  );

  app.get(
    "/sessions",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "List active devices",
        response: { 200: z.array(sessionSummarySchema) },
      },
    },
    async (request) => service.listSessions(request.user!.id, request.user!.sessionId),
  );

  app.delete(
    "/sessions/:sessionId",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Revoke one device session",
        params: z.object({ sessionId: z.string().uuid() }),
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.revokeSession(
        request.user!.id,
        request.params.sessionId,
        contextOf(request),
      );
      return { message: "Session revoked" };
    },
  );

  app.post(
    "/verify/request",
    {
      onRequest: [app.authenticate],
      config: { ...rateLimit(5, "15 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Send a verification code",
        body: requestVerificationBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      const user = await app.db.query.users.findFirst({
        where: (table, { eq }) => eq(table.id, request.user!.id),
      });

      const destination = request.body.channel === "EMAIL" ? user?.email : user?.phone;

      if (!destination) {
        throw new UnauthorizedError(
          `No ${request.body.channel.toLowerCase()} on file for this account`,
        );
      }

      await service.createVerificationToken(
        request.user!.id,
        request.body.channel === "EMAIL" ? "EMAIL_VERIFICATION" : "PHONE_VERIFICATION",
        destination,
      );

      // TODO(notifications): hand the token to the delivery channel. It is
      // deliberately never returned in the response.
      return { message: "Verification code sent" };
    },
  );

  app.post(
    "/verify/confirm",
    {
      onRequest: [app.authenticate],
      config: { ...rateLimit(10, "15 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Confirm a verification code",
        body: confirmVerificationBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.confirmVerification(
        request.user!.id,
        request.body.channel,
        request.body.token,
        contextOf(request),
      );
      return { message: "Verified" };
    },
  );

  app.post(
    "/password/forgot",
    {
      config: { ...rateLimit(5, "15 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Request a password reset",
        body: forgotPasswordBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.requestPasswordReset(request.body, contextOf(request));

      // TODO(notifications): dispatch the reset link when a token was issued.
      // The response is identical either way to avoid user enumeration.
      return {
        message: "If an account matches those details, a reset link has been sent.",
      };
    },
  );

  app.post(
    "/password/reset",
    {
      config: { ...rateLimit(5, "15 minutes") },
      schema: {
        tags: ["auth"],
        summary: "Complete a password reset",
        body: resetPasswordBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.resetPassword(
        request.body.token,
        request.body.password,
        contextOf(request),
      );
      return { message: "Password updated. Please sign in again." };
    },
  );

  app.post(
    "/password/change",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Change password while signed in",
        body: changePasswordBodySchema,
        response: { 200: messageResponseSchema },
      },
    },
    async (request) => {
      await service.changePassword(
        request.user!.id,
        request.body.currentPassword,
        request.body.newPassword,
        request.user!.sessionId,
        contextOf(request),
      );
      return { message: "Password changed. Other devices were signed out." };
    },
  );
};
