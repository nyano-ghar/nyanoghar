import { defineConfig } from "vitest/config";

/**
 * Integration tests: a real Fastify app via `app.inject()` against a real
 * Postgres. Requires `TEST_DATABASE_URL`.
 *
 * These share one database, so they run single-threaded — parallel files
 * would interleave writes and make failures non-deterministic. Each test
 * still namespaces its own data and cleans up after itself.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    // Migrations plus a cold serverless connection are slow on first hit.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
  },
});
