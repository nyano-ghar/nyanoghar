import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { type Role, roleSchema } from "./roles.js";

export const accessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  roles: z.array(roleSchema).min(1),
  /** Session id — lets us revoke a single device without touching others. */
  sid: z.string().uuid(),
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  sessionId: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface TokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  /** Any `jose` duration string, e.g. "15m". */
  ttl: string;
}

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  config: TokenConfig,
): Promise<string> {
  return new SignJWT({
    roles: claims.roles,
    sid: claims.sid,
    emailVerified: claims.emailVerified,
    phoneVerified: claims.phoneVerified,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(config.ttl)
    .sign(keyOf(config.secret));
}

/**
 * Verify signature, issuer, audience and expiry, then validate the claim
 * shape. Throws if the token is not trustworthy — callers turn that into a 401.
 */
export async function verifyAccessToken(
  token: string,
  config: Omit<TokenConfig, "ttl">,
): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, keyOf(config.secret), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["HS256"],
  });

  const claims = accessTokenClaimsSchema.parse(payload satisfies JWTPayload);

  return {
    id: claims.sub,
    roles: claims.roles,
    sessionId: claims.sid,
    emailVerified: claims.emailVerified,
    phoneVerified: claims.phoneVerified,
  };
}
