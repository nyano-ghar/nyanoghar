import { z } from "zod";
import { geoQuerySchema, locationSchema, uuidSchema } from "./common.js";

export const verificationStatusSchema = z.enum([
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
]);

export const providerKindSchema = z.enum(["CLINIC", "SHOP"]);

/** Opening hours per weekday; 0 = Sunday. Closed days are simply absent. */
export const openingHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
  )
  .max(14)
  .default([]);

export const createProviderSchema = z.object({
  kind: providerKindSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(3000).nullable().default(null),
  registrationNumber: z.string().max(80).nullable().default(null),
  phone: z.string().max(30),
  email: z.string().email().nullable().default(null),
  website: z.string().url().nullable().default(null),
  location: locationSchema,
  openingHours: openingHoursSchema,
  emergencyAvailable: z.boolean().default(false),
  emergencyPhone: z.string().max(30).nullable().default(null),
});

export const providerSchema = createProviderSchema.extend({
  id: uuidSchema,
  ownerId: uuidSchema,
  verificationStatus: verificationStatusSchema,
  ratingAverage: z.number().min(0).max(5).default(0),
  ratingCount: z.number().int().nonnegative().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const serviceSchema = z.object({
  id: uuidSchema,
  providerId: uuidSchema,
  name: z.string().min(2).max(120),
  category: z.enum([
    "CONSULTATION",
    "VACCINATION",
    "SURGERY",
    "DIAGNOSTICS",
    "GROOMING",
    "BOARDING",
    "TRAINING",
    "EMERGENCY",
    "OTHER",
  ]),
  description: z.string().max(2000).nullable(),
  priceMin: z.number().nonnegative().nullable(),
  priceMax: z.number().nonnegative().nullable(),
  currency: z.string().length(3).default("NPR"),
  durationMinutes: z.number().int().min(5).max(600).nullable(),
  isActive: z.boolean().default(true),
});

export const appointmentStatusSchema = z.enum([
  "REQUESTED",
  "CONFIRMED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

export const createAppointmentSchema = z
  .object({
    providerId: uuidSchema,
    serviceId: uuidSchema,
    /** Optional: the pet may not be listed on the platform. */
    petId: uuidSchema.nullable().default(null),
    petName: z.string().max(80).nullable().default(null),
    requestedFor: z.coerce.date(),
    notes: z.string().max(2000).nullable().default(null),
  })
  .refine(
    (input) =>
      input.petId !== null || (input.petName !== null && input.petName.length > 0),
    { message: "Provide petId or petName", path: ["petId"] },
  );

export const appointmentSchema = createAppointmentSchema.innerType().extend({
  id: uuidSchema,
  customerId: uuidSchema,
  status: appointmentStatusSchema,
  confirmedFor: z.date().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const providerSearchSchema = z
  .object({
    q: z.string().max(120).optional(),
    kind: providerKindSchema.optional(),
    category: serviceSchema.shape.category.optional(),
    emergencyOnly: z.coerce.boolean().optional(),
    verifiedOnly: z.coerce.boolean().default(true),
    openNow: z.coerce.boolean().optional(),
    province: z.string().optional(),
    district: z.string().optional(),
    sort: z.enum(["NEAREST", "RATING", "RECENT"]).default("NEAREST"),
  })
  .merge(geoQuerySchema.partial());
