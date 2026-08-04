import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import proxy from "@fastify/http-proxy";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import underPressure from "@fastify/under-pressure";
import { authPlugin, verifyAccessToken } from "@nyanoghar/auth";
import { registerErrorHandler } from "@nyanoghar/errors";
import { buildLoggerOptions } from "@nyanoghar/logger";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { config } from "./config.js";
import { createDatabase, type Database, type DbHandle } from "./db/client.js";
import { applicationRoutes } from "./modules/adoption/applications/applications.routes.js";
import { mediaRoutes } from "./modules/catalog/media/media.routes.js";
import { petRoutes } from "./modules/catalog/pets/pets.routes.js";
import { referenceRoutes } from "./modules/catalog/reference/reference.routes.js";
import { authRoutes } from "./modules/identity/auth/auth.routes.js";
import { userRoutes } from "./modules/identity/users/users.routes.js";
import { appointmentRoutes } from "./modules/provider/appointments/appointments.routes.js";
import { providerRoutes } from "./modules/provider/providers/providers.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    config: typeof config;
  }
}

/**
 * The core API: identity, catalog, adoption and provider in one Fastify app.
 *
 * These were four services behind a gateway. They shared a database, so the
 * split bought no isolation while costing a network hop wherever two domains
 * met. Chat stays a separate service — it has a genuinely different workload
 * (WebSocket fan-out, high-frequency writes) and its own database — and is
 * proxied through from here so clients still see one origin.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions({
      serviceName: config.SERVICE_NAME,
      level: config.LOG_LEVEL,
      pretty: config.NODE_ENV === "development",
    }),
    // Reuse an upstream correlation id when present so one id spans the
    // request chain, including the hop into chat-svc.
    genReqId: (request) =>
      (request.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    trustProxy: true,

    // JSON bodies only — media goes straight to S3 via presigned URLs and
    // never transits the API, so 1 MiB is generous.
    bodyLimit: 1_048_576,

    // Must exceed the load balancer's idle timeout, otherwise the server can
    // close a pooled connection just as the balancer sends a request on it,
    // which surfaces as intermittent 502s.
    keepAliveTimeout: 72_000,
    // Bounds a client that opens a connection and dribbles headers.
    requestTimeout: 30_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  const handle: DbHandle = createDatabase(
    config.DATABASE_URL,
    config.DATABASE_POOL_MAX,
  );

  app.decorate("db", handle.db);
  app.decorate("config", config);
  app.addHook("onClose", async () => {
    await handle.close();
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Rate limit per authenticated user when possible, otherwise per IP.
    keyGenerator: (request) => request.user?.id ?? request.ip,
    // Integration tests drive many requests from one address; the limiter is
    // exercised deliberately rather than tripped incidentally.
    global: config.NODE_ENV !== "test",
    enableDraftSpec: true,
  });

  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1_000_000_000,
    retryAfter: 30,
  });

  await app.register(authPlugin, {
    secret: config.JWT_ACCESS_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  if (config.NODE_ENV !== "production") {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Nyanoghar — Core API",
          description:
            "Identity, pet catalog, adoption workflow and provider directory.",
          version: "0.1.0",
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  const startedAt = Date.now();

  /**
   * Liveness of the chat service. Bounded so a hung upstream cannot make the
   * readiness probe itself hang — an unbounded check turns one sick
   * dependency into a rolling restart of every instance.
   */
  const pingChat = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${config.CHAT_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  app.get(
    "/health",
    { logLevel: "warn", schema: { tags: ["system"], summary: "Liveness probe" } },
    async () => ({
      status: "ok" as const,
      service: config.SERVICE_NAME,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    }),
  );

  app.get(
    "/ready",
    { logLevel: "warn", schema: { tags: ["system"], summary: "Readiness probe" } },
    async (_request, reply) => {
      // The database is the only hard dependency: without it every route
      // fails, so a failure here must pull the instance out of rotation.
      // Chat is reported but not fatal — the core API stays useful when
      // messaging is down, and failing readiness would take everything with
      // it.
      const [dbOk, chatOk] = await Promise.all([handle.ping(), pingChat()]);

      const checks = {
        database: dbOk ? ("ok" as const) : ("fail" as const),
        chat: chatOk ? ("ok" as const) : ("degraded" as const),
      };

      if (!dbOk) {
        reply.status(503);
        return { status: "unhealthy" as const, checks };
      }

      return {
        status: chatOk ? ("ok" as const) : ("degraded" as const),
        checks,
      };
    },
  );

  /**
   * A browser cannot set an Authorization header on a WebSocket handshake, so
   * the token is verified here and the identity forwarded as a trusted header
   * on the upgrade. Browsers can only pass it as a query parameter, so both
   * forms are accepted.
   */
  const authenticateUpgrade = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const token =
      (request.query as { token?: string } | undefined)?.token ??
      request.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      await reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "A token is required to open a chat socket",
          requestId: request.id,
        },
      });
      return;
    }

    try {
      const user = await verifyAccessToken(token, {
        secret: config.JWT_ACCESS_SECRET,
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      });
      request.headers["x-user-id"] = user.id;
      request.headers["x-user-roles"] = user.roles.join(",");
      request.headers["x-session-id"] = user.sessionId;
    } catch {
      await reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
          requestId: request.id,
        },
      });
    }
  };

  // Public URLs keep the /api/v1 prefix the gateway used to add, so existing
  // clients are unaffected by the consolidation.
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(petRoutes, { prefix: "/api/v1/pets" });
  // Shares the /pets prefix but is a separate plugin: it owns the S3 client,
  // which needs its own lifecycle.
  await app.register(mediaRoutes, { prefix: "/api/v1/pets" });
  await app.register(referenceRoutes, { prefix: "/api/v1/reference" });
  await app.register(applicationRoutes, { prefix: "/api/v1/applications" });
  await app.register(providerRoutes, { prefix: "/api/v1/providers" });
  await app.register(appointmentRoutes, { prefix: "/api/v1/appointments" });

  // Chat remains its own service. The token is verified here at the edge and
  // the identity forwarded downstream — chat-svc is not published outside the
  // cluster, which is what makes trusting those headers safe. If it ever
  // becomes directly reachable it must verify JWTs itself.
  await app.register(proxy, {
    upstream: config.CHAT_SERVICE_URL,
    prefix: "/api/v1/chat",
    rewritePrefix: "/v1/chat",
    websocket: true,
    wsUpstream: config.CHAT_SERVICE_WS_URL,
    wsClientOptions: { maxPayload: 1_048_576 },
    preHandler: authenticateUpgrade,
    replyOptions: {
      rewriteRequestHeaders: (request, headers) => ({
        ...headers,
        "x-request-id": String(request.id),
        "x-trace-id": String(request.id),
        "x-forwarded-for": request.ip,
        ...(request.user
          ? {
              "x-user-id": request.user.id,
              "x-user-roles": request.user.roles.join(","),
              "x-session-id": request.user.sessionId,
            }
          : {}),
      }),
      onError: (reply, error) => {
        reply.log.error({ err: error.error }, "chat upstream request failed");
        void reply.status(503).send({
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "The chat service is temporarily unavailable",
            requestId: reply.request.id,
          },
        });
      },
    },
  });

  return app;
}
