import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Every table this service owns lives in the `identity` Postgres schema.
 *
 * The four Fastify services share one database (see CLAUDE.md). A named schema
 * per service keeps the ownership boundary explicit and lets it be enforced
 * with GRANTs rather than convention alone.
 *
 * Use `identitySchema.table(...)` in place of `pgTable(...)`. Enums stay in
 * `public` — they are global type names and do not collide across services.
 */
export const identitySchema = pgSchema("identity");
