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
    //
    // All five S3 settings are optional so the service boots with no AWS
    // account at all — a contributor cloning the repo gets a stub driver and
    // every non-media route works untouched. They are all-or-nothing: the
    // refine below rejects a partial set, so a half-configured production
    // deploy fails at startup rather than at the first upload.
    MEDIA_S3_REGION: z.string().min(1).default("ap-south-1"),
    MEDIA_S3_ACCESS_KEY_ID: z.string().min(16).optional(),
    MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(32).optional(),
    /**
     * S3 API endpoint. Unset means real AWS.
     *
     * S3 is a protocol, not only a product: pointing this at MinIO (which
     * `pnpm infra:up:media` runs locally), Cloudflare R2, Backblaze B2 or
     * DigitalOcean Spaces makes the whole presign → PUT → confirm loop work
     * with no AWS account. That matters for an open-source repo — otherwise
     * the media feature is undevelopable without a credit card.
     */
    MEDIA_S3_ENDPOINT: z.string().url().optional(),
    /**
     * Address buckets as `<endpoint>/<bucket>/<key>` instead of the virtual
     * host style `<bucket>.<endpoint>/<key>`. Required by MinIO and LocalStack
     * on a bare host or IP, where a bucket subdomain does not resolve.
     */
    MEDIA_S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /** Approved listing photos. Fronted by CloudFront, never read directly. */
    MEDIA_PUBLIC_BUCKET: z.string().min(1).optional(),
    /**
     * Verification documents and health records. Must be a *different* bucket
     * with all public access blocked and no CloudFront origin — one bucket
     * has one policy, and a prefix condition is the only thing that would
     * keep documents private. Two buckets fail closed instead.
     */
    MEDIA_PRIVATE_BUCKET: z.string().min(1).optional(),
    /**
     * CloudFront domain for public reads, without a scheme. Only ever applied
     * at read time: rows store the S3 key, so changing distributions does not
     * require rewriting history.
     */
    MEDIA_CDN_DOMAIN: z.string().min(1).optional(),
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

/** The five settings that must be supplied together to enable real S3. */
const MEDIA_S3_KEYS = [
  "MEDIA_S3_ACCESS_KEY_ID",
  "MEDIA_S3_SECRET_ACCESS_KEY",
  "MEDIA_PUBLIC_BUCKET",
  "MEDIA_PRIVATE_BUCKET",
  "MEDIA_CDN_DOMAIN",
] as const;

/**
 * S3 is configured all-or-nothing.
 *
 * A partial set is always a mistake, and the dangerous direction is a
 * production deploy that sets four of the five and silently falls back to the
 * stub driver — uploads would appear to work and store nothing. Failing at
 * startup is the only safe reading.
 */
const checkedSchema = envSchema.superRefine((env, ctx) => {
  const present = MEDIA_S3_KEYS.filter((key) => env[key] !== undefined);
  if (present.length === 0 || present.length === MEDIA_S3_KEYS.length) return;

  const missing = MEDIA_S3_KEYS.filter((key) => env[key] === undefined);
  for (const key of missing) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message:
        "media S3 is partially configured — set all of " +
        `${MEDIA_S3_KEYS.join(", ")} or none of them (none uses the local stub driver)`,
    });
  }
});

/**
 * Treat a blank media setting as absent.
 *
 * `MEDIA_PUBLIC_BUCKET=` in a `.env`, and a GitHub Actions `env:` entry backed
 * by an unset secret, both arrive as the empty string. Without this they read
 * as "configured but invalid", so the service refuses to start with a
 * confusing partial-configuration error instead of falling back to the stub
 * driver. Only the S3 keys are normalised: elsewhere a blank value is a
 * genuine mistake worth reporting.
 */
function withBlankMediaAsUnset(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const normalised: NodeJS.ProcessEnv = { ...source };
  for (const key of MEDIA_S3_KEYS) {
    if (normalised[key]?.trim() === "") delete normalised[key];
  }
  return normalised;
}

const parsed = defineConfig(checkedSchema, withBlankMediaAsUnset(process.env));

/**
 * Whether real S3 credentials are present. When false the service runs with
 * the stub media driver: everything else works, media routes answer 501.
 */
const MEDIA_ENABLED = MEDIA_S3_KEYS.every((key) => parsed[key] !== undefined);

export const config = { ...parsed, MEDIA_ENABLED };
export type Config = typeof config;
