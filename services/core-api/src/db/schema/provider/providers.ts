import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { providerSchema } from "./_schema.js";

export const providerKindEnum = pgEnum("provider_kind", ["CLINIC", "SHOP"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
]);

export const serviceCategoryEnum = pgEnum("service_category", [
  "CONSULTATION",
  "VACCINATION",
  "SURGERY",
  "DIAGNOSTICS",
  "GROOMING",
  "BOARDING",
  "TRAINING",
  "EMERGENCY",
  "OTHER",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "REQUESTED",
  "CONFIRMED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

/** A veterinary clinic or a pet shop. Both share discovery and reviews. */
export const providers = providerSchema.table(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),

    kind: providerKindEnum("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    registrationNumber: text("registration_number"),

    phone: text("phone").notNull(),
    email: text("email"),
    website: text("website"),

    country: text("country").notNull().default("NP"),
    province: text("province"),
    district: text("district"),
    municipality: text("municipality"),
    area: text("area"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    emergencyAvailable: boolean("emergency_available").notNull().default(false),
    emergencyPhone: text("emergency_phone"),

    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by"),
    rejectionReason: text("rejection_reason"),

    // Denormalised aggregates, recomputed when a review is written.
    ratingAverage: numeric("rating_average", { precision: 3, scale: 2 })
      .notNull()
      .default("0"),
    ratingCount: integer("rating_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("providers_owner_idx").on(table.ownerId),
    index("providers_kind_status_idx").on(table.kind, table.verificationStatus),
    index("providers_location_idx").on(table.province, table.district),
    index("providers_geo_idx").on(table.latitude, table.longitude),
  ],
);

/** A provider may operate several branches; hours are per branch. */
export const branches = providerSchema.table(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    province: text("province"),
    district: text("district"),
    municipality: text("municipality"),
    area: text("area"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branches_provider_idx").on(table.providerId)],
);

export const openingHours = providerSchema.table(
  "opening_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    // 0 = Sunday. A closed day simply has no row.
    weekday: integer("weekday").notNull(),
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
  },
  (table) => [
    uniqueIndex("opening_hours_unique").on(
      table.providerId,
      table.branchId,
      table.weekday,
    ),
  ],
);

export const services = providerSchema.table(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: serviceCategoryEnum("category").notNull(),
    description: text("description"),
    priceMin: numeric("price_min", { precision: 10, scale: 2 }),
    priceMax: numeric("price_max", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("NPR"),
    durationMinutes: integer("duration_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("services_provider_idx").on(table.providerId, table.isActive),
    index("services_category_idx").on(table.category),
  ],
);

/** Clinic staff — the doctors a customer can be booked with. */
export const practitioners = providerSchema.table(
  "practitioners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    // Null when the practitioner has no platform account of their own.
    userId: uuid("user_id"),
    fullName: text("full_name").notNull(),
    qualification: text("qualification"),
    licenseNumber: text("license_number"),
    specialization: text("specialization"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("practitioners_provider_idx").on(table.providerId)],
);

export const appointments = providerSchema.table(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),

    customerId: uuid("customer_id").notNull(),
    // The pet may not be listed on the platform, so a free-text name is
    // accepted as an alternative to a catalog reference.
    petId: uuid("pet_id"),
    petName: text("pet_name"),

    status: appointmentStatusEnum("status").notNull().default("REQUESTED"),
    requestedFor: timestamp("requested_for", { withTimezone: true }).notNull(),
    confirmedFor: timestamp("confirmed_for", { withTimezone: true }),
    notes: text("notes"),
    // Clinical notes are provider-only and never returned to the customer.
    practitionerNotes: text("practitioner_notes"),
    cancellationReason: text("cancellation_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_provider_queue_idx").on(table.providerId, table.status),
    index("appointments_customer_idx").on(table.customerId, table.status),
    index("appointments_schedule_idx").on(table.requestedFor),
  ],
);

/** Documents submitted for verification — restricted to admins. */
export const verificationDocuments = providerSchema.table(
  "verification_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    url: text("url").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [index("verification_documents_provider_idx").on(table.providerId)],
);

export const providersRelations = relations(providers, ({ many }) => ({
  branches: many(branches),
  services: many(services),
  practitioners: many(practitioners),
  openingHours: many(openingHours),
  appointments: many(appointments),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  provider: one(providers, {
    fields: [services.providerId],
    references: [providers.id],
  }),
}));

/**
 * Inverses of the `many()` sides declared on `providersRelations`.
 *
 * Drizzle needs both halves of a relation to infer the join. A missing
 * inverse is not a type error — it throws "There is not enough information
 * to infer relation" the first time the query runs, so the provider profile
 * endpoint fails at request time rather than at build time.
 */
export const branchesRelations = relations(branches, ({ one }) => ({
  provider: one(providers, {
    fields: [branches.providerId],
    references: [providers.id],
  }),
}));

export const practitionersRelations = relations(practitioners, ({ one }) => ({
  provider: one(providers, {
    fields: [practitioners.providerId],
    references: [providers.id],
  }),
}));

export const openingHoursRelations = relations(openingHours, ({ one }) => ({
  provider: one(providers, {
    fields: [openingHours.providerId],
    references: [providers.id],
  }),
}));

export const verificationDocumentsRelations = relations(
  verificationDocuments,
  ({ one }) => ({
    provider: one(providers, {
      fields: [verificationDocuments.providerId],
      references: [providers.id],
    }),
  }),
);

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  provider: one(providers, {
    fields: [appointments.providerId],
    references: [providers.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
}));

export type ProviderRow = typeof providers.$inferSelect;
export type AppointmentRow = typeof appointments.$inferSelect;
