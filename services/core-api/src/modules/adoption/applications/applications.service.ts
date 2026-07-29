import {
  APPLICATION_TRANSITIONS,
  type ApplicationStatus,
  type createApplicationSchema,
} from "@nyanoghar/contracts";
import { ForbiddenError, NotFoundError, UnprocessableError } from "@nyanoghar/errors";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Config } from "../../../config.js";
import type { Database } from "../../../db/client.js";
import {
  type ApplicationRow,
  adoptions,
  applicationStatusHistory,
  applications,
  meetings,
  pets,
} from "../../../db/schema/index.js";

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Statuses that still occupy one of the adopter's open application slots. */
const OPEN_STATUSES: ApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "SHORTLISTED",
  "MEETING_SCHEDULED",
  "APPROVED",
];

export class ApplicationsService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
  ) {}

  async countOpenForApplicant(applicantId: string): Promise<number> {
    const rows = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.applicantId, applicantId),
          inArray(applications.status, OPEN_STATUSES),
        ),
      );
    return rows.length;
  }

  async assertCanSubmit(applicantId: string): Promise<void> {
    const open = await this.countOpenForApplicant(applicantId);
    if (open >= this.config.MAX_OPEN_APPLICATIONS_PER_USER) {
      throw new UnprocessableError(
        `You already have ${open} applications in progress. Withdraw one before applying again.`,
      );
    }
  }

  /**
   * Creates an application against a live listing.
   *
   * This used to be a 501: the adoption service could not see the catalog
   * tables, so verifying the listing meant an HTTP call that was never built.
   * Both modules now share a database, so the check is a read of
   * `catalog.pets` in the same transaction as the insert — the listing cannot
   * be pulled or reserved between the check and the write.
   *
   * Reaching into another module's schema is deliberate and narrow: a single
   * read of columns the adoption domain must denormalise anyway.
   */
  async submit(
    applicantId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationRow> {
    return this.db.transaction(async (tx) => {
      const listing = await tx
        .select({
          id: pets.id,
          name: pets.name,
          ownerId: pets.ownerId,
          organizationId: pets.organizationId,
          status: pets.status,
          deletedAt: pets.deletedAt,
        })
        .from(pets)
        .where(eq(pets.id, input.petId))
        .for("share")
        .then((rows) => rows[0]);

      if (!listing || listing.deletedAt) throw new NotFoundError("Pet listing");

      // Only a published listing accepts applications. A paused, reserved or
      // already-adopted pet must not gather new ones.
      if (listing.status !== "PUBLISHED") {
        throw new UnprocessableError(
          `This listing is not accepting applications (status: ${listing.status})`,
        );
      }

      // An owner applying for their own pet is always a mistake.
      if (listing.ownerId === applicantId) {
        throw new ForbiddenError("You cannot apply to adopt your own listing");
      }

      const existing = await tx
        .select({ id: applications.id, status: applications.status })
        .from(applications)
        .where(
          and(
            eq(applications.applicantId, applicantId),
            eq(applications.petId, input.petId),
          ),
        )
        .then((rows) => rows[0]);

      if (existing && OPEN_STATUSES.includes(existing.status)) {
        throw new UnprocessableError(
          "You already have an open application for this pet",
        );
      }

      const [created] = await tx
        .insert(applications)
        .values({
          petId: listing.id,
          // Denormalised at submission time so an owner's review queue does
          // not join back to catalog on every read.
          petName: listing.name,
          ownerId: listing.ownerId,
          organizationId: listing.organizationId,
          applicantId,
          status: "SUBMITTED",
          message: input.message,
          housingType: input.household.housingType,
          ownsHome: String(input.household.ownsHome),
          hasYard: String(input.household.hasYard),
          householdSize: input.household.householdSize,
          hasChildren: String(input.household.hasChildren),
          youngestChildAge: input.household.youngestChildAge,
          existingPets: input.household.existingPets,
          hoursAlonePerDay: input.household.hoursAlonePerDay,
          previousPetExperience: input.household.previousPetExperience,
          customAnswers: input.customAnswers,
          documentIds: input.documentIds,
        })
        .returning();

      if (!created) throw new UnprocessableError("Could not create application");

      await tx.insert(applicationStatusHistory).values({
        applicationId: created.id,
        fromStatus: null,
        toStatus: "SUBMITTED",
        changedBy: applicantId,
        note: null,
      });

      // TODO(events): publish adoption.application.submitted so the owner is
      // notified once a publisher exists.
      return created;
    });
  }

  /** Applications the caller submitted. */
  async listForApplicant(
    applicantId: string,
    status?: ApplicationStatus,
  ): Promise<ApplicationRow[]> {
    const filters = [eq(applications.applicantId, applicantId)];
    if (status) filters.push(eq(applications.status, status));

    return this.db
      .select()
      .from(applications)
      .where(and(...filters))
      .orderBy(desc(applications.submittedAt));
  }

  /** Applications received on the caller's own listings. */
  async listForOwner(
    ownerId: string,
    filter: { status?: ApplicationStatus; petId?: string } = {},
  ): Promise<ApplicationRow[]> {
    const filters = [eq(applications.ownerId, ownerId)];
    if (filter.status) filters.push(eq(applications.status, filter.status));
    if (filter.petId) filters.push(eq(applications.petId, filter.petId));

    return this.db
      .select()
      .from(applications)
      .where(and(...filters))
      .orderBy(desc(applications.submittedAt));
  }

  /**
   * One application with its history and meetings.
   *
   * Applications carry household details — address, children, work patterns —
   * so only the two parties and moderators may read one.
   */
  async findForViewer(applicationId: string, viewer: { id: string; roles: string[] }) {
    const application = await this.db.query.applications.findFirst({
      where: eq(applications.id, applicationId),
      with: { history: true, meetings: true },
    });

    if (!application) throw new NotFoundError("Application");

    const isParty =
      application.applicantId === viewer.id || application.ownerId === viewer.id;
    const isStaff =
      viewer.roles.includes("MODERATOR") || viewer.roles.includes("ADMIN");

    if (!isParty && !isStaff) {
      throw new ForbiddenError("You are not a party to this application");
    }

    return application;
  }

  /**
   * Proposes a meeting and advances the application in one step, so the two
   * cannot diverge — a scheduled meeting always implies MEETING_SCHEDULED.
   */
  async scheduleMeeting(
    applicationId: string,
    ownerId: string,
    meeting: Omit<typeof meetings.$inferInsert, "applicationId" | "proposedBy">,
  ) {
    const application = await this.db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)),
    });

    if (!application) throw new NotFoundError("Application");

    const [created] = await this.db
      .insert(meetings)
      .values({ applicationId: application.id, proposedBy: ownerId, ...meeting })
      .returning();

    await this.changeStatus(application.id, "MEETING_SCHEDULED", ownerId);

    return created;
  }

  /**
   * Moves an application through its workflow. The transition table decides
   * both whether the move is legal and which party may make it, so an adopter
   * can never approve their own application.
   */
  async changeStatus(
    applicationId: string,
    to: ApplicationStatus,
    actorId: string,
    note?: string,
  ): Promise<ApplicationRow> {
    const application = await this.db.query.applications.findFirst({
      where: eq(applications.id, applicationId),
    });

    if (!application) throw new NotFoundError("Application");

    const isOwner = application.ownerId === actorId;
    const isApplicant = application.applicantId === actorId;

    if (!isOwner && !isApplicant) {
      throw new ForbiddenError("You are not a party to this application");
    }

    const from = application.status as ApplicationStatus;
    const transition = APPLICATION_TRANSITIONS[from].find((entry) => entry.to === to);

    if (!transition) {
      throw new UnprocessableError(`An application cannot move from ${from} to ${to}`);
    }

    const actorRole = isOwner ? "owner" : "applicant";
    if (transition.actor !== actorRole) {
      throw new ForbiddenError(
        `Only the ${transition.actor} can move an application to ${to}`,
      );
    }

    const now = new Date();
    const isTerminal = ["APPROVED", "REJECTED", "WITHDRAWN", "COMPLETED"].includes(to);

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(applications)
        .set({
          status: to,
          rejectionReason:
            to === "REJECTED" ? (note ?? null) : application.rejectionReason,
          decidedAt: isTerminal ? now : application.decidedAt,
          updatedAt: now,
        })
        .where(eq(applications.id, applicationId))
        .returning();

      await tx.insert(applicationStatusHistory).values({
        applicationId,
        fromStatus: from,
        toStatus: to,
        changedBy: actorId,
        note: note ?? null,
      });

      // A completed adoption is a permanent record, written once.
      if (to === "COMPLETED" && row) {
        await tx
          .insert(adoptions)
          .values({
            applicationId,
            petId: row.petId,
            adopterId: row.applicantId,
            ownerId: row.ownerId,
          })
          .onConflictDoNothing();
      }

      return row;
    });

    if (!updated) throw new NotFoundError("Application");

    // TODO(events): publish adoption.application.status_changed, and
    // adoption.completed on COMPLETED so the catalog module marks the pet ADOPTED.
    return updated;
  }
}
