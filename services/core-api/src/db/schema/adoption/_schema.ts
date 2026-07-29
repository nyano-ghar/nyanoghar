import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Every table this service owns lives in the `adoption` Postgres schema.
 * See `./identity/_schema.ts` for the rationale.
 */
export const adoptionSchema = pgSchema("adoption");
