import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Environment shared by every Fastify service. Individual services extend this
 * with their own schema via `defineConfig`.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SERVICE_NAME: z.string().min(1),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** Postgres connection, used by every service that owns a database. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
});

/** Redis, used for caching, rate limiting and short-lived tokens. */
export const redisEnvSchema = z.object({
  REDIS_URL: z.string().url(),
});

/** JWT verification material. The gateway and every service needs this. */
export const jwtEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_ISSUER: z.string().default("nyanoghar"),
  JWT_AUDIENCE: z.string().default("nyanoghar-clients"),
});

/**
 * Parse and validate the process environment against `schema`.
 * Fails fast with a readable report so a misconfigured container never
 * starts and silently serves broken behaviour.
 */
export function defineConfig<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export { z };
