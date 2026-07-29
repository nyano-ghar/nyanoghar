import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { breeds, species } from "../../../db/schema/index.js";

export type CreateSpeciesInput = Pick<
  typeof species.$inferInsert,
  "slug" | "nameEn" | "nameNe"
>;

export type CreateBreedInput = Pick<
  typeof breeds.$inferInsert,
  "speciesId" | "slug" | "nameEn" | "nameNe"
>;

/**
 * Species and breed reference data. Reads are public; writes are admin-only
 * (spec §6.6).
 */
export class ReferenceService {
  // No config dependency today; add one if this service starts needing it.
  constructor(private readonly db: Database) {}

  /** Inactive species stay in the table for historical rows but are hidden. */
  async listSpecies() {
    return this.db.select().from(species).where(eq(species.isActive, true));
  }

  async listBreeds(speciesId: string) {
    return this.db.select().from(breeds).where(eq(breeds.speciesId, speciesId));
  }

  async createSpecies(input: CreateSpeciesInput) {
    const [created] = await this.db.insert(species).values(input).returning();
    return created;
  }

  async createBreed(input: CreateBreedInput) {
    const [created] = await this.db.insert(breeds).values(input).returning();
    return created;
  }
}
