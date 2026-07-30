import {
  baseEnvSchema,
  databaseEnvSchema,
  defineConfig,
  jwtEnvSchema,
  redisEnvSchema,
  z,
} from "@nyanoghar/config";

/**
 * Configuration for the whole core API.
 *
 * This is the union of what identity, catalog, adoption and provider each
 * used to parse separately. The inter-service URLs those configs carried
 * (CATALOG_SERVICE_URL and friends) are gone — those modules are now in this
 * process and call each other directly.
 */
const envSchema = baseEnvSchema
  .merge(databaseEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .extend({
    SERVICE_NAME: z.string().default("core-api"),
    PORT: z.coerce.number().int().positive().default(4000),

    // --- identity ---------------------------------------------------------
    /** Refresh tokens are opaque random strings, stored only as hashes. */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Max concurrent sessions before the oldest is evicted. */
    MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(10),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    /** Lock the account after this many consecutive failed logins. */
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

    // --- catalog ----------------------------------------------------------
    /** Published listings go stale after this long without an update. */
    LISTING_EXPIRY_DAYS: z.coerce.number().int().positive().default(60),
    MAX_MEDIA_PER_PET: z.coerce.number().int().positive().default(12),

    // --- adoption ---------------------------------------------------------
    /** Stops one adopter from spamming every listing on the platform. */
    MAX_OPEN_APPLICATIONS_PER_USER: z.coerce.number().int().positive().default(5),

    // --- provider ---------------------------------------------------------
    /** How far ahead a customer may book an appointment. */
    APPOINTMENT_HORIZON_DAYS: z.coerce.number().int().positive().default(90),

    // --- media (S3 + CloudFront) ------------------------------------------
    // Binary media never transits the API: clients PUT straight to S3 with a
    // presigned URL and read public objects through CloudFront (spec 15, 17).
    MEDIA_S3_REGION: z.string().min(1).default("ap-south-1"),
    MEDIA_S3_ACCESS_KEY_ID: z.string().min(16),
    MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(32),
    /** Approved listing photos. Fronted by CloudFront, never read directly. */
    MEDIA_PUBLIC_BUCKET: z.string().min(1),
    /**
     * Verification documents and health records. Must be a *different* bucket
     * with all public access blocked and no CloudFront origin — one bucket
     * has one policy, and a prefix condition is the only thing that would
     * keep documents private. Two buckets fail closed instead.
     */
    MEDIA_PRIVATE_BUCKET: z.string().min(1),
    /**
     * CloudFront domain for public reads, without a scheme. Only ever applied
     * at read time: rows store the S3 key, so changing distributions does not
     * require rewriting history.
     */
    MEDIA_CDN_DOMAIN: z.string().min(1),
    /** Presigned PUT lifetime. Short: the URL is used immediately. */
    MEDIA_UPLOAD_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(3600)
      .default(300),
    /** Presigned GET lifetime for private objects. */
    MEDIA_PRIVATE_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(3600)
      .default(300),
    /** Rejected at presign time, and enforced again by the S3 policy. */
    MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),

    // --- chat (still a separate service) ----------------------------------
    CHAT_SERVICE_URL: z.string().url().default("http://chat-svc:8080"),
    CHAT_SERVICE_WS_URL: z.string().default("ws://chat-svc:8080"),

    NATS_URL: z.string().default("nats://nats:4222"),

    CORS_ORIGINS: z
      .string()
      .default("*")
      .transform((value) =>
        value === "*" ? true : value.split(",").map((origin) => origin.trim()),
      ),
  });

export const config = defineConfig(envSchema);
export type Config = typeof config;
