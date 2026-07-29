import { ForbiddenError, UnauthorizedError } from "@nyanoghar/errors";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { Role, STAFF_ROLES } from "./roles.js";
import { type AuthenticatedUser, verifyAccessToken } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by `authenticate`; undefined on public routes. */
    user?: AuthenticatedUser;
  }

  interface FastifyInstance {
    /** Rejects the request unless a valid access token is present. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Populates `request.user` when a token is present, but never rejects. */
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Requires at least one of `roles`. Admins always pass. */
    requireRoles: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Requires a verified email address — used for adoption actions. */
    requireVerifiedEmail: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  secret: string;
  issuer: string;
  audience: string;
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;

  return token;
}

const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  const verify = async (request: FastifyRequest): Promise<AuthenticatedUser> => {
    const token = extractBearer(request);
    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    try {
      return await verifyAccessToken(token, {
        secret: options.secret,
        issuer: options.issuer,
        audience: options.audience,
      });
    } catch (cause) {
      request.log.debug({ err: cause }, "access token rejected");
      throw new UnauthorizedError("Invalid or expired access token");
    }
  };

  app.decorate("authenticate", async (request: FastifyRequest) => {
    request.user = await verify(request);
  });

  app.decorate("optionalAuth", async (request: FastifyRequest) => {
    if (!extractBearer(request)) return;
    try {
      request.user = await verify(request);
    } catch {
      // A bad token on an optional route is treated as anonymous rather than
      // an error, so public listings stay reachable with a stale token.
      request.user = undefined;
    }
  });

  app.decorate("requireRoles", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        await app.authenticate(request, reply);
      }

      const user = request.user;
      if (!user) throw new UnauthorizedError();

      const permitted =
        user.roles.includes(Role.ADMIN) ||
        roles.some((role) => user.roles.includes(role));

      if (!permitted) {
        throw new ForbiddenError(
          `Requires one of the following roles: ${roles.join(", ")}`,
        );
      }
    };
  });

  app.decorate(
    "requireVerifiedEmail",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        await app.authenticate(request, reply);
      }

      if (!request.user?.emailVerified) {
        throw new ForbiddenError("A verified email address is required");
      }
    },
  );
};

export const authPlugin = fp(authPluginImpl, {
  name: "nyanoghar-auth",
  fastify: "5.x",
});

export { STAFF_ROLES };
