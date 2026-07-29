import { z } from "zod";
import { uuidSchema } from "./common.js";

/**
 * Subjects published to NATS JetStream. Services own their own subjects and
 * never write to another service's tables — cross-service reactions happen
 * through these events.
 */
export const EventSubject = {
  UserRegistered: "identity.user.registered",
  UserRoleGranted: "identity.user.role_granted",
  UserSuspended: "identity.user.suspended",
  UserDeleted: "identity.user.deleted",

  PetPublished: "catalog.pet.published",
  PetStatusChanged: "catalog.pet.status_changed",
  PetRemoved: "catalog.pet.removed",

  ApplicationSubmitted: "adoption.application.submitted",
  ApplicationStatusChanged: "adoption.application.status_changed",
  MeetingScheduled: "adoption.meeting.scheduled",
  AdoptionCompleted: "adoption.completed",

  AppointmentRequested: "provider.appointment.requested",
  AppointmentStatusChanged: "provider.appointment.status_changed",
  ProviderVerified: "provider.verified",

  /** Emitted by the Go chat service. */
  ConversationStarted: "chat.conversation.started",
  MessageSent: "chat.message.sent",
} as const;

export type EventSubject = (typeof EventSubject)[keyof typeof EventSubject];

/** Envelope every event shares. `id` is the idempotency key for consumers. */
export const eventEnvelopeSchema = z.object({
  id: uuidSchema,
  subject: z.string(),
  occurredAt: z.string().datetime(),
  /** Correlation id threaded from the originating HTTP request. */
  traceId: z.string().nullable().default(null),
  producer: z.string(),
  version: z.number().int().positive().default(1),
});

export function event<T extends z.ZodTypeAny>(payload: T) {
  return eventEnvelopeSchema.extend({ payload });
}

export const userRegisteredEvent = event(
  z.object({
    userId: uuidSchema,
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    roles: z.array(z.string()),
  }),
);

export const petPublishedEvent = event(
  z.object({
    petId: uuidSchema,
    ownerId: uuidSchema,
    speciesId: uuidSchema,
    province: z.string().nullable(),
    district: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    urgency: z.string(),
  }),
);

export const applicationSubmittedEvent = event(
  z.object({
    applicationId: uuidSchema,
    petId: uuidSchema,
    applicantId: uuidSchema,
    ownerId: uuidSchema,
  }),
);

export const adoptionCompletedEvent = event(
  z.object({
    applicationId: uuidSchema,
    petId: uuidSchema,
    adopterId: uuidSchema,
    ownerId: uuidSchema,
    completedAt: z.string().datetime(),
  }),
);

export const appointmentRequestedEvent = event(
  z.object({
    appointmentId: uuidSchema,
    providerId: uuidSchema,
    customerId: uuidSchema,
    requestedFor: z.string().datetime(),
  }),
);
