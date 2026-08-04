import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Find the nearest `.env`, walking up from the working directory.
 *
 * This is a pnpm workspace: `pnpm dev` and `pnpm db:seed` run with the cwd set
 * to `services/core-api`, but `.env` lives at the repo root. Plain
 * `dotenv.config()` resolves against cwd and would silently find nothing, so
 * every service would report its whole environment as missing even though the
 * file is right there. Walking up is what makes one root `.env` work no matter
 * which package a script is invoked from.
 */
function findEnvFile(from: string = process.cwd()): string | undefined {
  let directory = resolve(from);

  for (;;) {
    const candidate = join(directory, ".env");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    // dirname() of a filesystem root returns the root itself.
    if (parent === directory) return undefined;
    directory = parent;
  }
}

const envFile = findEnvFile();

// Without a path dotenv looks only at cwd. An explicit path is what makes the
// lookup above meaningful; when nothing is found we still call it so real
// process environment variables (containers, CI) keep working.
loadDotenv(envFile ? { path: envFile } : undefined);

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
 * Load `.env` without pulling in a service's full config schema.
 *
 * Importing this module already loads dotenv, so this is a no-op marker that
 * lets a standalone script (a CLI, a migration, a seed) depend on `.env`
 * having been read without also requiring every variable the HTTP service
 * needs. Seeding reference data should not demand a JWT secret.
 */
export function loadEnv(): string | undefined {
  // The module-level load above has already run by the time any importer can
  // call this. Kept as an explicit, greppable entry point; returns the file
  // that was used, which is useful in a script's error message.
  return envFile;
}

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
