import { defineConfig } from "vitest/config";

/**
 * Unit tests run everywhere and need nothing external.
 *
 * Integration tests talk to a real Postgres and are therefore opt-in: they
 * only run when `TEST_DATABASE_URL` is set (`pnpm test:integration`). CI has
 * no database, so `pnpm test` must stay green without one.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "test/integration/**"],
  },
});
