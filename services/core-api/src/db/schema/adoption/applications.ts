import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { adoptionSchema } from "./_schema.js";

export const applicationStatusEnum = pgEnum("application_status", [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "SHORTLISTED",
  "MEETING_SCHEDULED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "COMPLETED",
]);

export const meetingKindEnum = pgEnum("meeting_kind", [
  "MEET_AND_GREET",
  "HOME_VISIT",
  "VIDEO_CALL",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "PROPOSED",
  "CONFIRMED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
]);

export const applications = adoptionSchema.table(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Cross-service references, denormalised at submission time so the
    // reviewer's queue does not join back to catalog on every read.
    petId: uuid("pet_id").notNull(),
    petName: text("pet_name").notNull(),
    applicantId: uuid("applicant_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    organizationId: uuid("organization_id"),

    status: applicationStatusEnum("status").notNull().default("SUBMITTED"),
    message: text("message").notNull(),

    housingType: text("housing_type").notNull(),
    ownsHome: text("owns_home").notNull(),
    hasYard: text("has_yard").notNull(),
    householdSize: integer("household_size").notNull(),
    hasChildren: text("has_children").notNull(),
    youngestChildAge: integer("youngest_child_age"),
    existingPets: text("existing_pets"),
    hoursAlonePerDay: integer("hours_alone_per_day").notNull(),
    previousPetExperience: text("previous_pet_experience"),

    /** Answers to an organization's custom form, keyed by question id. */
    customAnswers: jsonb("custom_answers")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),

    ownerNotes: text("owner_notes"),
    rejectionReason: text("rejection_reason"),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One live application per adopter per pet.
    uniqueIndex("applications_applicant_pet_unique").on(table.applicantId, table.petId),
    index("applications_owner_queue_idx").on(table.ownerId, table.status),
    index("applications_applicant_idx").on(table.applicantId, table.status),
    index("applications_pet_idx").on(table.petId),
  ],
);

export const applicationStatusHistory = adoptionSchema.table(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("application_history_idx").on(table.applicationId, table.createdAt),
  ],
);

export const meetings = adoptionSchema.table(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: meetingKindEnum("kind").notNull().default("MEET_AND_GREET"),
    status: meetingStatusEnum("status").notNull().default("PROPOSED"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    locationText: text("location_text"),
    notes: text("notes"),
    proposedBy: uuid("proposed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("meetings_application_idx").on(table.applicationId),
    index("meetings_schedule_idx").on(table.scheduledFor),
  ],
);

/** Completed adoptions — the permanent record referenced by spec 6.2. */
export const adoptions = adoptionSchema.table(
  "adoptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    petId: uuid("pet_id").notNull(),
    adopterId: uuid("adopter_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("adoptions_application_unique").on(table.applicationId),
    index("adoptions_pet_idx").on(table.petId),
    index("adoptions_adopter_idx").on(table.adopterId),
  ],
);

export const reviews = adoptionSchema.table(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    // Reviews are only accepted from a completed adoption or appointment.
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    isHidden: text("is_hidden"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reviews_author_source_unique").on(table.authorId, table.sourceId),
    index("reviews_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const reports = adoptionSchema.table(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("OPEN"),
    resolvedBy: uuid("resolved_by"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("reports_status_idx").on(table.status, table.createdAt),
    index("reports_target_idx").on(table.targetType, table.targetId),
  ],
);

export const applicationsRelations = relations(applications, ({ many }) => ({
  history: many(applicationStatusHistory),
  meetings: many(meetings),
}));

/**
 * The inverse of `applicationsRelations.history`.
 *
 * Drizzle needs both sides of a relation to infer the join. Without this,
 * any `with: { history: true }` query throws "There is not enough
 * information to infer relation" at runtime — which is not a type error, so
 * only an integration test catches it.
 */
export const applicationStatusHistoryRelations = relations(
  applicationStatusHistory,
  ({ one }) => ({
    application: one(applications, {
      fields: [applicationStatusHistory.applicationId],
      references: [applications.id],
    }),
  }),
);

export const meetingsRelations = relations(meetings, ({ one }) => ({
  application: one(applications, {
    fields: [meetings.applicationId],
    references: [applications.id],
  }),
}));

export type ApplicationRow = typeof applications.$inferSelect;
