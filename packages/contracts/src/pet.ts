import { z } from "zod";
import { geoQuerySchema, locationSchema, mediaSchema, uuidSchema } from "./common.js";

/** Listing lifecycle, verbatim from spec section 7.3. */
export const listingStatusSchema = z.enum([
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

export type ListingStatus = z.infer<typeof listingStatusSchema>;

/**
 * Transitions the API permits. Anything not listed here is rejected, which
 * keeps a listing from jumping straight from DRAFT to ADOPTED.
 */
export const ALLOWED_LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "REMOVED"],
  PENDING_REVIEW: ["PUBLISHED", "REJECTED", "DRAFT", "REMOVED"],
  PUBLISHED: ["PAUSED", "RESERVED", "ADOPTED", "EXPIRED", "REMOVED"],
  PAUSED: ["PUBLISHED", "EXPIRED", "REMOVED"],
  RESERVED: ["PUBLISHED", "ADOPTED", "REMOVED"],
  ADOPTED: ["REMOVED"],
  REJECTED: ["DRAFT", "REMOVED"],
  EXPIRED: ["DRAFT", "PUBLISHED", "REMOVED"],
  REMOVED: [],
};

export const sexSchema = z.enum(["MALE", "FEMALE", "UNKNOWN"]);
export const sizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"]);
export const energyLevelSchema = z.enum(["LOW", "MODERATE", "HIGH"]);
export const urgencySchema = z.enum(["NORMAL", "ELEVATED", "URGENT"]);
export const coatTypeSchema = z.enum([
  "SHORT",
  "MEDIUM",
  "LONG",
  "HAIRLESS",
  "CURLY",
  "WIRE",
]);

export const vaccinationStatusSchema = z.enum([
  "NONE",
  "PARTIAL",
  "UP_TO_DATE",
  "UNKNOWN",
]);

/** Tri-state: a listing may genuinely not know how a pet reacts to children. */
export const triStateSchema = z.enum(["YES", "NO", "UNKNOWN"]);

export const petHealthSchema = z.object({
  vaccinationStatus: vaccinationStatusSchema.default("UNKNOWN"),
  sterilized: triStateSchema.default("UNKNOWN"),
  microchipped: triStateSchema.default("UNKNOWN"),
  dewormed: triStateSchema.default("UNKNOWN"),
  specialNeeds: z.boolean().default(false),
  disabilityInfo: z.string().max(2000).nullable().default(null),
  medicalConditions: z.string().max(2000).nullable().default(null),
});

export const petBehaviourSchema = z.object({
  personality: z.array(z.string().max(40)).max(12).default([]),
  energyLevel: energyLevelSchema.default("MODERATE"),
  houseTrained: triStateSchema.default("UNKNOWN"),
  goodWithChildren: triStateSchema.default("UNKNOWN"),
  goodWithDogs: triStateSchema.default("UNKNOWN"),
  goodWithCats: triStateSchema.default("UNKNOWN"),
  trainingNotes: z.string().max(2000).nullable().default(null),
});

export const createPetSchema = z
  .object({
    name: z.string().min(1).max(80),
    speciesId: uuidSchema,
    breedId: uuidSchema.nullable().default(null),
    isMixedBreed: z.boolean().default(false),
    sex: sexSchema,
    dateOfBirth: z.coerce.date().nullable().default(null),
    estimatedAgeMonths: z.number().int().min(0).max(600).nullable().default(null),
    size: sizeSchema.nullable().default(null),
    weightKg: z.number().positive().max(200).nullable().default(null),
    color: z.string().max(60).nullable().default(null),
    coatType: coatTypeSchema.nullable().default(null),
    description: z.string().max(5000),
    rescueStory: z.string().max(5000).nullable().default(null),
    location: locationSchema,
    adoptionRadiusKm: z.number().positive().max(500).default(50),
    adoptionFee: z.number().nonnegative().default(0),
    currency: z.string().length(3).default("NPR"),
    adoptionRequirements: z.string().max(3000).nullable().default(null),
    urgency: urgencySchema.default("NORMAL"),
    health: petHealthSchema.default({}),
    behaviour: petBehaviourSchema.default({}),
  })
  .refine((pet) => pet.dateOfBirth !== null || pet.estimatedAgeMonths !== null, {
    message: "Provide either dateOfBirth or estimatedAgeMonths",
    path: ["dateOfBirth"],
  });

export const updatePetSchema = createPetSchema.innerType().partial();

export const petSchema = createPetSchema.innerType().extend({
  id: uuidSchema,
  ownerId: uuidSchema,
  organizationId: uuidSchema.nullable(),
  status: listingStatusSchema,
  media: z.array(mediaSchema).default([]),
  viewCount: z.number().int().nonnegative().default(0),
  favoriteCount: z.number().int().nonnegative().default(0),
  publishedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Pet = z.infer<typeof petSchema>;

/** Discovery filters backing the search screen. */
export const petSearchSchema = z
  .object({
    q: z.string().max(120).optional(),
    speciesId: uuidSchema.optional(),
    breedId: uuidSchema.optional(),
    sex: sexSchema.optional(),
    size: sizeSchema.optional(),
    minAgeMonths: z.coerce.number().int().min(0).optional(),
    maxAgeMonths: z.coerce.number().int().min(0).optional(),
    goodWithChildren: z.coerce.boolean().optional(),
    goodWithDogs: z.coerce.boolean().optional(),
    goodWithCats: z.coerce.boolean().optional(),
    specialNeeds: z.coerce.boolean().optional(),
    maxFee: z.coerce.number().nonnegative().optional(),
    urgency: urgencySchema.optional(),
    province: z.string().optional(),
    district: z.string().optional(),
    sort: z.enum(["RECENT", "NEAREST", "URGENT", "POPULAR"]).default("RECENT"),
  })
  .merge(geoQuerySchema.partial())
  .refine(
    (query) =>
      query.minAgeMonths === undefined ||
      query.maxAgeMonths === undefined ||
      query.minAgeMonths <= query.maxAgeMonths,
    { message: "minAgeMonths must not exceed maxAgeMonths", path: ["minAgeMonths"] },
  )
  .refine(
    (query) =>
      query.sort !== "NEAREST" ||
      (query.latitude !== undefined && query.longitude !== undefined),
    { message: "Sorting by NEAREST requires latitude and longitude", path: ["sort"] },
  );

export type PetSearchQuery = z.infer<typeof petSearchSchema>;
