import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogSchema } from "./_schema.js";

export const listingStatusEnum = pgEnum("listing_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "PAUSED",
  "RESERVED",
  "ADOPTED",
  "REJECTED",
  "EXPIRED",
  "REMOVED",
]);

export const sexEnum = pgEnum("pet_sex", ["MALE", "FEMALE", "UNKNOWN"]);
export const sizeEnum = pgEnum("pet_size", ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"]);
export const energyEnum = pgEnum("energy_level", ["LOW", "MODERATE", "HIGH"]);
export const urgencyEnum = pgEnum("urgency", ["NORMAL", "ELEVATED", "URGENT"]);
export const triStateEnum = pgEnum("tri_state", ["YES", "NO", "UNKNOWN"]);
export const vaccinationEnum = pgEnum("vaccination_status", [
  "NONE",
  "PARTIAL",
  "UP_TO_DATE",
  "UNKNOWN",
]);
export const mediaKindEnum = pgEnum("media_kind", ["IMAGE", "VIDEO", "DOCUMENT"]);

/** Reference data managed by admins (spec 6.6). */
export const species = catalogSchema.table("species", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameNe: text("name_ne"),
  isActive: boolean("is_active").notNull().default(true),
});

export const breeds = catalogSchema.table(
  "breeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameNe: text("name_ne"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("breeds_species_slug_unique").on(table.speciesId, table.slug),
  ],
);

export const pets = catalogSchema.table(
  "pets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owned by the identity module; no FK across module boundaries.
    ownerId: uuid("owner_id").notNull(),
    organizationId: uuid("organization_id"),

    name: text("name").notNull(),
    speciesId: uuid("species_id")
      .notNull()
      .references(() => species.id),
    breedId: uuid("breed_id").references(() => breeds.id),
    isMixedBreed: boolean("is_mixed_breed").notNull().default(false),

    sex: sexEnum("sex").notNull(),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    estimatedAgeMonths: integer("estimated_age_months"),
    size: sizeEnum("size"),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
    color: text("color"),
    coatType: text("coat_type"),

    description: text("description").notNull(),
    rescueStory: text("rescue_story"),

    country: text("country").notNull().default("NP"),
    province: text("province"),
    district: text("district"),
    municipality: text("municipality"),
    area: text("area"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    adoptionRadiusKm: integer("adoption_radius_km").notNull().default(50),

    adoptionFee: numeric("adoption_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("NPR"),
    adoptionRequirements: text("adoption_requirements"),
    urgency: urgencyEnum("urgency").notNull().default("NORMAL"),

    vaccinationStatus: vaccinationEnum("vaccination_status")
      .notNull()
      .default("UNKNOWN"),
    sterilized: triStateEnum("sterilized").notNull().default("UNKNOWN"),
    microchipped: triStateEnum("microchipped").notNull().default("UNKNOWN"),
    dewormed: triStateEnum("dewormed").notNull().default("UNKNOWN"),
    specialNeeds: boolean("special_needs").notNull().default(false),
    disabilityInfo: text("disability_info"),
    medicalConditions: text("medical_conditions"),

    personality: jsonb("personality").$type<string[]>().notNull().default([]),
    energyLevel: energyEnum("energy_level").notNull().default("MODERATE"),
    houseTrained: triStateEnum("house_trained").notNull().default("UNKNOWN"),
    goodWithChildren: triStateEnum("good_with_children").notNull().default("UNKNOWN"),
    goodWithDogs: triStateEnum("good_with_dogs").notNull().default("UNKNOWN"),
    goodWithCats: triStateEnum("good_with_cats").notNull().default("UNKNOWN"),
    trainingNotes: text("training_notes"),

    status: listingStatusEnum("status").notNull().default("DRAFT"),
    rejectionReason: text("rejection_reason"),

    viewCount: integer("view_count").notNull().default(0),
    favoriteCount: integer("favorite_count").notNull().default(0),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pets_owner_idx").on(table.ownerId),
    index("pets_species_idx").on(table.speciesId),
    // Covers the default discovery query: published listings, newest first.
    index("pets_discovery_idx")
      .on(table.status, table.publishedAt)
      .where(sql`${table.deletedAt} is null`),
    index("pets_location_idx").on(table.province, table.district),
    index("pets_geo_idx").on(table.latitude, table.longitude),
    index("pets_urgency_idx").on(table.urgency),
  ],
);

export const petMedia = catalogSchema.table(
  "pet_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull().default("IMAGE"),
    // Storage coordinates, not a URL. The CDN domain is applied at read time
    // so replacing a distribution does not require rewriting history, and so
    // a private object can never accidentally carry a public URL.
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    position: integer("position").notNull().default(0),
    // Documents (vaccination cards) are only visible to the owner and to
    // applicants the owner has shortlisted.
    isPrivate: boolean("is_private").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pet_media_pet_idx").on(table.petId, table.position),
    // One row per stored object: confirm is idempotent and a replayed confirm
    // must not create a duplicate.
    uniqueIndex("pet_media_bucket_key_unique").on(table.bucket, table.key),
  ],
);

export const favorites = catalogSchema.table(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("favorites_unique").on(table.userId, table.petId),
    index("favorites_user_idx").on(table.userId),
  ],
);

/** Audit trail of every listing status change, for moderators. */
export const petStatusHistory = catalogSchema.table(
  "pet_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    fromStatus: listingStatusEnum("from_status"),
    toStatus: listingStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pet_status_history_pet_idx").on(table.petId, table.createdAt)],
);

export const petsRelations = relations(pets, ({ one, many }) => ({
  species: one(species, { fields: [pets.speciesId], references: [species.id] }),
  breed: one(breeds, { fields: [pets.breedId], references: [breeds.id] }),
  media: many(petMedia),
  statusHistory: many(petStatusHistory),
}));

export const petMediaRelations = relations(petMedia, ({ one }) => ({
  pet: one(pets, { fields: [petMedia.petId], references: [pets.id] }),
}));

/**
 * Inverse of `petsRelations.statusHistory`. Drizzle needs both sides to infer
 * the join; without it a `with: { statusHistory: true }` query throws at
 * runtime rather than failing to compile.
 */
export const petStatusHistoryRelations = relations(petStatusHistory, ({ one }) => ({
  pet: one(pets, { fields: [petStatusHistory.petId], references: [pets.id] }),
}));

export const breedsRelations = relations(breeds, ({ one }) => ({
  species: one(species, { fields: [breeds.speciesId], references: [species.id] }),
}));

export type PetRow = typeof pets.$inferSelect;
export type NewPetRow = typeof pets.$inferInsert;
