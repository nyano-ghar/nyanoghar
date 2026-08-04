import {
  ALLOWED_LISTING_TRANSITIONS,
  type createPetSchema,
  type ListingStatus,
  type PetSearchQuery,
} from "@nyanoghar/contracts";
import { ForbiddenError, NotFoundError, UnprocessableError } from "@nyanoghar/errors";
import { and, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Config } from "../../../config.js";
import type { Database } from "../../../db/client.js";
import {
  favorites,
  type PetRow,
  petStatusHistory,
  pets,
} from "../../../db/schema/index.js";

export type CreatePetInput = z.infer<typeof createPetSchema>;

export class PetsService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
  ) {}

  /**
   * Loads a pet the caller is allowed to administer. Owners may act on their
   * own listings; moderators on any.
   */
  private async loadOwned(
    petId: string,
    userId: string,
    isModerator: boolean,
  ): Promise<PetRow> {
    const pet = await this.db.query.pets.findFirst({
      where: and(eq(pets.id, petId), isNull(pets.deletedAt)),
    });

    if (!pet) throw new NotFoundError("Pet");
    if (!isModerator && pet.ownerId !== userId) {
      throw new ForbiddenError("You do not manage this listing");
    }

    return pet;
  }

  /**
   * Applies a status change after checking it against the allowed transition
   * map, and records it in the audit trail.
   */
  async changeStatus(
    petId: string,
    to: ListingStatus,
    userId: string,
    isModerator: boolean,
    reason?: string,
  ): Promise<PetRow> {
    const pet = await this.loadOwned(petId, userId, isModerator);
    const from = pet.status as ListingStatus;

    if (from === to) return pet;

    if (!ALLOWED_LISTING_TRANSITIONS[from].includes(to)) {
      throw new UnprocessableError(`A listing cannot move from ${from} to ${to}`);
    }

    // Only moderators may approve a listing out of review.
    if (
      from === "PENDING_REVIEW" &&
      (to === "PUBLISHED" || to === "REJECTED") &&
      !isModerator
    ) {
      throw new ForbiddenError("Only moderators can review listings");
    }

    const now = new Date();
    const publishing = to === "PUBLISHED" && pet.publishedAt === null;

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(pets)
        .set({
          status: to,
          rejectionReason: to === "REJECTED" ? (reason ?? null) : null,
          publishedAt: publishing ? now : pet.publishedAt,
          expiresAt:
            to === "PUBLISHED"
              ? new Date(now.getTime() + this.config.LISTING_EXPIRY_DAYS * 86_400_000)
              : pet.expiresAt,
          updatedAt: now,
        })
        .where(eq(pets.id, petId))
        .returning();

      await tx.insert(petStatusHistory).values({
        petId,
        fromStatus: from,
        toStatus: to,
        changedBy: userId,
        reason: reason ?? null,
      });

      return row;
    });

    if (!updated) throw new NotFoundError("Pet");

    // TODO(events): publish catalog.pet.status_changed (and pet.published on
    // first publish) so the adoption module and notifications can react.
    return updated;
  }

  /**
   * Discovery search with its total, run as one round trip.
   */
  async search(query: PetSearchQuery & { page: number; perPage: number }) {
    const filters = this.buildSearchFilters(query);
    const order = this.buildSearchOrder(query);
    const offset = (query.page - 1) * query.perPage;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select()
        .from(pets)
        .where(and(...filters))
        .orderBy(...order)
        .limit(query.perPage)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(pets)
        .where(and(...filters)),
    ]);

    const total = counted?.total ?? 0;
    return {
      data: rows,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        hasMore: offset + rows.length < total,
      },
    };
  }

  /**
   * Loads one listing for a viewer.
   *
   * An unpublished listing is reported as missing rather than forbidden, so
   * the endpoint does not confirm that a draft exists to someone who may not
   * see it.
   */
  async findForViewer(
    petId: string,
    viewer: { id: string; roles: string[] } | undefined,
    onViewCountError: (error: unknown) => void,
  ) {
    const pet = await this.db.query.pets.findFirst({
      where: and(eq(pets.id, petId), isNull(pets.deletedAt)),
      with: { media: true, species: true, breed: true },
    });

    if (!pet) throw new NotFoundError("Pet");

    const canSeeUnpublished =
      viewer &&
      (viewer.id === pet.ownerId ||
        viewer.roles.includes("MODERATOR") ||
        viewer.roles.includes("ADMIN"));

    if (pet.status !== "PUBLISHED" && !canSeeUnpublished) {
      throw new NotFoundError("Pet");
    }

    // Fire-and-forget: a failed counter must never fail the read.
    void this.db
      .update(pets)
      .set({ viewCount: sql`${pets.viewCount} + 1` })
      .where(eq(pets.id, pet.id))
      .catch(onViewCountError);

    return pet;
  }

  async create(ownerId: string, body: CreatePetInput) {
    const [created] = await this.db
      .insert(pets)
      .values({
        ownerId,
        name: body.name,
        speciesId: body.speciesId,
        breedId: body.breedId,
        isMixedBreed: body.isMixedBreed,
        sex: body.sex,
        dateOfBirth: body.dateOfBirth,
        estimatedAgeMonths: body.estimatedAgeMonths,
        size: body.size,
        // numeric columns round-trip as strings in postgres-js.
        weightKg: body.weightKg === null ? null : String(body.weightKg),
        color: body.color,
        coatType: body.coatType,
        description: body.description,
        rescueStory: body.rescueStory,
        country: body.location.country,
        province: body.location.province,
        district: body.location.district,
        municipality: body.location.municipality,
        area: body.location.area,
        latitude: body.location.latitude,
        longitude: body.location.longitude,
        adoptionRadiusKm: body.adoptionRadiusKm,
        adoptionFee: String(body.adoptionFee),
        currency: body.currency,
        adoptionRequirements: body.adoptionRequirements,
        urgency: body.urgency,
        vaccinationStatus: body.health.vaccinationStatus,
        sterilized: body.health.sterilized,
        microchipped: body.health.microchipped,
        dewormed: body.health.dewormed,
        specialNeeds: body.health.specialNeeds,
        disabilityInfo: body.health.disabilityInfo,
        medicalConditions: body.health.medicalConditions,
        personality: body.behaviour.personality,
        energyLevel: body.behaviour.energyLevel,
        houseTrained: body.behaviour.houseTrained,
        goodWithChildren: body.behaviour.goodWithChildren,
        goodWithDogs: body.behaviour.goodWithDogs,
        goodWithCats: body.behaviour.goodWithCats,
        trainingNotes: body.behaviour.trainingNotes,
        // Always starts as a draft; publishing is a separate transition.
        status: "DRAFT",
      })
      .returning();

    return created;
  }

  async update(petId: string, ownerId: string): Promise<PetRow> {
    // TODO: map nested location/health/behaviour patches onto columns the
    // same way `create` does. Until then this only touches updatedAt.
    const [updated] = await this.db
      .update(pets)
      .set({ updatedAt: new Date() })
      .where(and(eq(pets.id, petId), eq(pets.ownerId, ownerId), isNull(pets.deletedAt)))
      .returning();

    if (!updated) throw new NotFoundError("Pet");
    return updated;
  }

  /**
   * Favourite/unfavourite. The denormalised counter is only moved when the
   * insert or delete actually changed something, so repeated calls cannot
   * inflate it.
   */
  async addFavorite(userId: string, petId: string): Promise<{ favorited: true }> {
    const inserted = await this.db
      .insert(favorites)
      .values({ userId, petId })
      .onConflictDoNothing()
      .returning({ id: favorites.id });

    if (inserted.length > 0) {
      await this.db
        .update(pets)
        .set({ favoriteCount: sql`${pets.favoriteCount} + 1` })
        .where(eq(pets.id, petId));
    }

    return { favorited: true };
  }

  async removeFavorite(userId: string, petId: string): Promise<{ favorited: false }> {
    const removed = await this.db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.petId, petId)))
      .returning({ id: favorites.id });

    if (removed.length > 0) {
      await this.db
        .update(pets)
        .set({ favoriteCount: sql`greatest(${pets.favoriteCount} - 1, 0)` })
        .where(eq(pets.id, petId));
    }

    return { favorited: false };
  }

  /** The owner's own listings, in any status. */
  async listOwn(ownerId: string, status?: ListingStatus): Promise<PetRow[]> {
    const filters = [eq(pets.ownerId, ownerId), isNull(pets.deletedAt)];
    if (status) filters.push(eq(pets.status, status));

    return this.db
      .select()
      .from(pets)
      .where(and(...filters))
      .orderBy(pets.updatedAt);
  }

  /**
   * Builds the discovery query. Only PUBLISHED, non-deleted listings are ever
   * visible to anonymous callers.
   */
  buildSearchFilters(query: PetSearchQuery): SQL[] {
    const filters: SQL[] = [eq(pets.status, "PUBLISHED"), isNull(pets.deletedAt)];

    if (query.speciesId) filters.push(eq(pets.speciesId, query.speciesId));
    if (query.breedId) filters.push(eq(pets.breedId, query.breedId));
    if (query.sex) filters.push(eq(pets.sex, query.sex));
    if (query.size) filters.push(eq(pets.size, query.size));
    if (query.urgency) filters.push(eq(pets.urgency, query.urgency));
    if (query.province) filters.push(eq(pets.province, query.province));
    if (query.district) filters.push(eq(pets.district, query.district));

    if (query.specialNeeds !== undefined) {
      filters.push(eq(pets.specialNeeds, query.specialNeeds));
    }
    if (query.goodWithChildren) filters.push(eq(pets.goodWithChildren, "YES"));
    if (query.goodWithDogs) filters.push(eq(pets.goodWithDogs, "YES"));
    if (query.goodWithCats) filters.push(eq(pets.goodWithCats, "YES"));

    if (query.maxFee !== undefined) {
      filters.push(lte(pets.adoptionFee, String(query.maxFee)));
    }

    // Age is stored either as a birth date or an estimate, so the filter has
    // to consider both representations.
    if (query.minAgeMonths !== undefined) {
      filters.push(
        sql`coalesce(
          ${pets.estimatedAgeMonths},
          extract(year from age(now(), ${pets.dateOfBirth})) * 12
            + extract(month from age(now(), ${pets.dateOfBirth}))
        ) >= ${query.minAgeMonths}`,
      );
    }
    if (query.maxAgeMonths !== undefined) {
      filters.push(
        sql`coalesce(
          ${pets.estimatedAgeMonths},
          extract(year from age(now(), ${pets.dateOfBirth})) * 12
            + extract(month from age(now(), ${pets.dateOfBirth}))
        ) <= ${query.maxAgeMonths}`,
      );
    }

    if (query.q) {
      const term = `%${query.q}%`;
      filters.push(
        sql`(${pets.name} ilike ${term} or ${pets.description} ilike ${term})`,
      );
    }

    // Bounding-box prefilter; the precise distance is applied in ORDER BY.
    if (query.latitude !== undefined && query.longitude !== undefined) {
      const radius = query.radiusKm ?? 25;
      const latDelta = radius / 111;
      const lngDelta =
        radius / (111 * Math.max(Math.cos((query.latitude * Math.PI) / 180), 0.01));

      filters.push(gte(pets.latitude, query.latitude - latDelta));
      filters.push(lte(pets.latitude, query.latitude + latDelta));
      filters.push(gte(pets.longitude, query.longitude - lngDelta));
      filters.push(lte(pets.longitude, query.longitude + lngDelta));
    }

    return filters;
  }

  buildSearchOrder(query: PetSearchQuery): SQL[] {
    switch (query.sort) {
      case "NEAREST":
        // Squared euclidean distance is monotonic with true distance at these
        // scales and avoids a trigonometric call per row.
        return [
          sql`(
            (${pets.latitude} - ${query.latitude}) ^ 2 +
            (${pets.longitude} - ${query.longitude}) ^ 2
          ) asc`,
        ];
      case "URGENT":
        return [
          sql`case ${pets.urgency}
            when 'URGENT' then 0 when 'ELEVATED' then 1 else 2 end asc`,
          desc(pets.publishedAt),
        ];
      case "POPULAR":
        return [desc(pets.favoriteCount), desc(pets.viewCount)];
      default:
        return [desc(pets.publishedAt)];
    }
  }
}
