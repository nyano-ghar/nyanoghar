import type { createAppointmentSchema } from "@nyanoghar/contracts";
import { ForbiddenError, NotFoundError, UnprocessableError } from "@nyanoghar/errors";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Config } from "../../../config.js";
import type { Database } from "../../../db/client.js";
import {
  type AppointmentRow,
  appointments,
  providers,
  services,
} from "../../../db/schema/index.js";

export type AppointmentStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type AppointmentActor = "provider" | "customer";

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Legal appointment state changes, and who may make each.
 *
 * Encoding the actor alongside the target status is what stops a customer
 * marking their own appointment COMPLETED or NO_SHOW. Extend this table
 * rather than adding branching at a call site.
 */
export const APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  { to: AppointmentStatus; actor: AppointmentActor }[]
> = {
  REQUESTED: [
    { to: "CONFIRMED", actor: "provider" },
    { to: "RESCHEDULED", actor: "provider" },
    { to: "CANCELLED", actor: "provider" },
    { to: "CANCELLED", actor: "customer" },
  ],
  CONFIRMED: [
    { to: "RESCHEDULED", actor: "provider" },
    { to: "COMPLETED", actor: "provider" },
    { to: "NO_SHOW", actor: "provider" },
    { to: "CANCELLED", actor: "provider" },
    { to: "CANCELLED", actor: "customer" },
  ],
  RESCHEDULED: [
    { to: "CONFIRMED", actor: "provider" },
    { to: "CANCELLED", actor: "provider" },
    { to: "CANCELLED", actor: "customer" },
  ],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/** Whether `actor` may move an appointment from `from` to `to`. */
export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
  actor: AppointmentActor,
): boolean {
  return (APPOINTMENT_TRANSITIONS[from] ?? []).some(
    (transition) => transition.to === to && transition.actor === actor,
  );
}

export class AppointmentsService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
  ) {}

  /**
   * Books a request against an active service. The booking window is bounded
   * on both sides — the past is nonsense, and an unbounded future lets one
   * customer squat on a calendar indefinitely.
   */
  async request(
    customerId: string,
    body: CreateAppointmentInput,
  ): Promise<AppointmentRow | undefined> {
    const horizon = new Date(
      Date.now() + this.config.APPOINTMENT_HORIZON_DAYS * 86_400_000,
    );

    if (body.requestedFor < new Date()) {
      throw new UnprocessableError("Appointments cannot be booked in the past");
    }
    if (body.requestedFor > horizon) {
      throw new UnprocessableError(
        `Appointments can be booked at most ${this.config.APPOINTMENT_HORIZON_DAYS} days ahead`,
      );
    }

    // The service must belong to the named provider and still be active,
    // otherwise a stale client could book a withdrawn service.
    const service = await this.db.query.services.findFirst({
      where: and(
        eq(services.id, body.serviceId),
        eq(services.providerId, body.providerId),
        eq(services.isActive, true),
      ),
    });
    if (!service) throw new NotFoundError("Service");

    const [created] = await this.db
      .insert(appointments)
      .values({
        providerId: body.providerId,
        serviceId: body.serviceId,
        customerId,
        petId: body.petId,
        petName: body.petName,
        requestedFor: body.requestedFor,
        notes: body.notes,
        status: "REQUESTED",
      })
      .returning();

    // TODO(events): publish provider.appointment.requested for notifications.
    return created;
  }

  async listForCustomer(customerId: string): Promise<AppointmentRow[]> {
    return this.db
      .select()
      .from(appointments)
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.requestedFor));
  }

  /** Provider-side queue. Ownership is checked before anything is returned. */
  async listForProvider(
    providerId: string,
    ownerId: string,
  ): Promise<AppointmentRow[]> {
    const provider = await this.db.query.providers.findFirst({
      where: and(eq(providers.id, providerId), eq(providers.ownerId, ownerId)),
    });
    if (!provider) throw new NotFoundError("Provider");

    return this.db
      .select()
      .from(appointments)
      .where(eq(appointments.providerId, provider.id))
      .orderBy(desc(appointments.requestedFor));
  }

  /**
   * Moves an appointment through its lifecycle. The transition table decides
   * both whether the move is legal and which party may make it.
   */
  async changeStatus(
    appointmentId: string,
    actorId: string,
    to: AppointmentStatus,
    options: { confirmedFor?: Date; reason?: string } = {},
  ): Promise<AppointmentRow | undefined> {
    const appointment = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: { provider: true },
    });
    if (!appointment) throw new NotFoundError("Appointment");

    const isCustomer = appointment.customerId === actorId;
    const isProvider = appointment.provider.ownerId === actorId;
    if (!isCustomer && !isProvider) {
      throw new ForbiddenError("You are not a party to this appointment");
    }

    const actor: AppointmentActor = isProvider ? "provider" : "customer";
    const from = appointment.status as AppointmentStatus;

    if (!canTransition(from, to, actor)) {
      throw new UnprocessableError(
        `A ${actor} cannot move an appointment from ${from} to ${to}`,
      );
    }

    const [updated] = await this.db
      .update(appointments)
      .set({
        status: to,
        confirmedFor:
          options.confirmedFor ??
          (to === "CONFIRMED" ? appointment.requestedFor : appointment.confirmedFor),
        cancellationReason: to === "CANCELLED" ? (options.reason ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, appointment.id))
      .returning();

    return updated;
  }
}
