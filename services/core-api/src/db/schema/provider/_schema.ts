import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Every table this service owns lives in the `provider` Postgres schema.
 * See `./identity/_schema.ts` for the rationale.
 */
export const providerSchema = pgSchema("provider");
