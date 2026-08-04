import { loadEnv } from "@nyanoghar/config";
import { eq } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { breeds, species } from "./schema/catalog/pets.js";

// Reads .env without requiring the service's full config schema.
loadEnv();

/**
 * Reference data for a usable local database.
 *
 * Species and breeds are admin-managed reference rows (spec 6.6) that no
 * migration creates, so a freshly migrated database has none — and without
 * them `POST /api/v1/pets` cannot be called at all, because a listing needs a
 * `species_id`. A new contributor would otherwise have to hand-write UUIDs
 * before they could exercise a single write path.
 *
 * This only seeds reference data. It creates no users and no listings: those
 * are cheap to make through the API, and fabricating them here would mean
 * inventing passwords and ownership that the auth flow should be the one to
 * establish.
 *
 * Safe to run repeatedly — every insert upserts on its natural key.
 */

interface SeedBreed {
  slug: string;
  nameEn: string;
  nameNe?: string;
}

interface SeedSpecies {
  slug: string;
  nameEn: string;
  nameNe: string;
  breeds: SeedBreed[];
}

/**
 * Breeds common in Nepal, plus the mixed/unknown entries that in practice
 * cover most rescue listings. Nepali names are supplied where a widely used
 * one exists rather than transliterating the English.
 */
const SEED: SeedSpecies[] = [
  {
    slug: "dog",
    nameEn: "Dog",
    nameNe: "कुकुर",
    breeds: [
      { slug: "mixed", nameEn: "Mixed breed" },
      { slug: "nepali-street-dog", nameEn: "Nepali street dog", nameNe: "बोक्सी कुकुर" },
      { slug: "bhote-kukur", nameEn: "Bhote Kukur (Tibetan Mastiff)" },
      { slug: "labrador-retriever", nameEn: "Labrador Retriever" },
      { slug: "german-shepherd", nameEn: "German Shepherd" },
      { slug: "golden-retriever", nameEn: "Golden Retriever" },
      { slug: "pomeranian", nameEn: "Pomeranian" },
      { slug: "pug", nameEn: "Pug" },
      { slug: "beagle", nameEn: "Beagle" },
      { slug: "rottweiler", nameEn: "Rottweiler" },
      { slug: "siberian-husky", nameEn: "Siberian Husky" },
      { slug: "unknown", nameEn: "Unknown" },
    ],
  },
  {
    slug: "cat",
    nameEn: "Cat",
    nameNe: "बिरालो",
    breeds: [
      { slug: "mixed", nameEn: "Mixed breed" },
      { slug: "domestic-shorthair", nameEn: "Domestic Shorthair" },
      { slug: "domestic-longhair", nameEn: "Domestic Longhair" },
      { slug: "persian", nameEn: "Persian" },
      { slug: "siamese", nameEn: "Siamese" },
      { slug: "british-shorthair", nameEn: "British Shorthair" },
      { slug: "unknown", nameEn: "Unknown" },
    ],
  },
  {
    slug: "bird",
    nameEn: "Bird",
    nameNe: "चरा",
    breeds: [
      { slug: "budgerigar", nameEn: "Budgerigar" },
      { slug: "cockatiel", nameEn: "Cockatiel" },
      { slug: "lovebird", nameEn: "Lovebird" },
      { slug: "pigeon", nameEn: "Pigeon", nameNe: "परेवा" },
      { slug: "unknown", nameEn: "Unknown" },
    ],
  },
  {
    slug: "rabbit",
    nameEn: "Rabbit",
    nameNe: "खरायो",
    breeds: [
      { slug: "mixed", nameEn: "Mixed breed" },
      { slug: "dutch", nameEn: "Dutch" },
      { slug: "lop", nameEn: "Lop" },
      { slug: "unknown", nameEn: "Unknown" },
    ],
  },
  {
    slug: "other",
    nameEn: "Other",
    nameNe: "अन्य",
    breeds: [{ slug: "unknown", nameEn: "Unknown" }],
  },
];

async function main(): Promise<void> {
  // Deliberately not the app config: seeding needs a database URL and nothing
  // else, and importing `config.js` would make this fail without JWT_ACCESS_SECRET
  // and REDIS_URL — neither of which has anything to do with reference data.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env, or pass it inline:\n" +
        "  DATABASE_URL='postgres://user:pass@host:5432/db' pnpm db:seed",
    );
  }

  const handle = createDatabase(url, Number(process.env.DATABASE_POOL_MAX ?? 10));

  try {
    let speciesCount = 0;
    let breedCount = 0;

    for (const entry of SEED) {
      // `onConflictDoUpdate` rather than `DoNothing` so re-running picks up
      // corrected names, and always returns the row we need for the FK below.
      const [row] = await handle.db
        .insert(species)
        .values({ slug: entry.slug, nameEn: entry.nameEn, nameNe: entry.nameNe })
        .onConflictDoUpdate({
          target: species.slug,
          set: { nameEn: entry.nameEn, nameNe: entry.nameNe },
        })
        .returning();

      // Defensive: a conflicting-but-unreturned row would otherwise produce a
      // confusing null-reference further down.
      const speciesId =
        row?.id ??
        (
          await handle.db.query.species.findFirst({
            where: eq(species.slug, entry.slug),
          })
        )?.id;

      if (!speciesId) throw new Error(`failed to upsert species '${entry.slug}'`);
      speciesCount += 1;

      for (const breed of entry.breeds) {
        await handle.db
          .insert(breeds)
          .values({
            speciesId,
            slug: breed.slug,
            nameEn: breed.nameEn,
            nameNe: breed.nameNe,
          })
          .onConflictDoUpdate({
            target: [breeds.speciesId, breeds.slug],
            set: { nameEn: breed.nameEn, nameNe: breed.nameNe },
          });
        breedCount += 1;
      }
    }

    // Not app logging: this is a CLI, and its output is the whole point.
    console.warn(`seeded ${speciesCount} species and ${breedCount} breeds`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error("seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
