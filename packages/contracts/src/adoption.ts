import { z } from "zod";
import { uuidSchema } from "./common.js";

export const applicationStatusSchema = z.enum([
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

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/**
 * Who may drive each transition. `owner` covers the listing owner and any
 * organization staff acting for them; `applicant` is the adopter.
 */
export const APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  { to: ApplicationStatus; actor: "owner" | "applicant" }[]
> = {
  SUBMITTED: [
    { to: "UNDER_REVIEW", actor: "owner" },
    { to: "REJECTED", actor: "owner" },
    { to: "WITHDRAWN", actor: "applicant" },
  ],
  UNDER_REVIEW: [
    { to: "INFO_REQUESTED", actor: "owner" },
    { to: "SHORTLISTED", actor: "owner" },
    { to: "REJECTED", actor: "owner" },
    { to: "WITHDRAWN", actor: "applicant" },
  ],
  INFO_REQUESTED: [
    { to: "UNDER_REVIEW", actor: "applicant" },
    { to: "REJECTED", actor: "owner" },
    { to: "WITHDRAWN", actor: "applicant" },
  ],
  SHORTLISTED: [
    { to: "MEETING_SCHEDULED", actor: "owner" },
    { to: "APPROVED", actor: "owner" },
    { to: "REJECTED", actor: "owner" },
    { to: "WITHDRAWN", actor: "applicant" },
  ],
  MEETING_SCHEDULED: [
    { to: "APPROVED", actor: "owner" },
    { to: "REJECTED", actor: "owner" },
    { to: "WITHDRAWN", actor: "applicant" },
  ],
  APPROVED: [{ to: "COMPLETED", actor: "owner" }],
  REJECTED: [],
  WITHDRAWN: [],
  COMPLETED: [],
};

export const householdSchema = z.object({
  housingType: z.enum(["APARTMENT", "HOUSE", "FARM", "OTHER"]),
  ownsHome: z.boolean(),
  hasYard: z.boolean(),
  householdSize: z.number().int().min(1).max(30),
  hasChildren: z.boolean(),
  youngestChildAge: z.number().int().min(0).max(25).nullable().default(null),
  existingPets: z.string().max(1000).nullable().default(null),
  hoursAlonePerDay: z.number().int().min(0).max(24),
  previousPetExperience: z.string().max(2000).nullable().default(null),
});

export const createApplicationSchema = z.object({
  petId: uuidSchema,
  message: z.string().min(20).max(3000),
  household: householdSchema,
  /** Answers to the organization's custom form, keyed by question id. */
  customAnswers: z.record(uuidSchema, z.string().max(2000)).default({}),
  documentIds: z.array(uuidSchema).max(10).default([]),
});

export const applicationSchema = createApplicationSchema.extend({
  id: uuidSchema,
  applicantId: uuidSchema,
  ownerId: uuidSchema,
  status: applicationStatusSchema,
  ownerNotes: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.date(),
  decidedAt: z.date().nullable(),
  updatedAt: z.date(),
});

export const meetingSchema = z.object({
  id: uuidSchema,
  applicationId: uuidSchema,
  kind: z.enum(["MEET_AND_GREET", "HOME_VISIT", "VIDEO_CALL"]),
  scheduledFor: z.date(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  locationText: z.string().max(500).nullable(),
  status: z.enum(["PROPOSED", "CONFIRMED", "RESCHEDULED", "CANCELLED", "COMPLETED"]),
  notes: z.string().max(2000).nullable(),
});

export const reviewSchema = z.object({
  id: uuidSchema,
  authorId: uuidSchema,
  subjectType: z.enum(["USER", "ORGANIZATION", "CLINIC", "SHOP"]),
  subjectId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable(),
  createdAt: z.date(),
});

export const reportSchema = z.object({
  targetType: z.enum([
    "USER",
    "PET",
    "REVIEW",
    "MESSAGE",
    "ORGANIZATION",
    "SHOP",
    "CLINIC",
  ]),
  targetId: uuidSchema,
  reason: z.enum([
    "FRAUD",
    "ANIMAL_WELFARE",
    "SPAM",
    "HARASSMENT",
    "MISLEADING_INFO",
    "DUPLICATE_LISTING",
    "OTHER",
  ]),
  description: z.string().max(3000),
});
