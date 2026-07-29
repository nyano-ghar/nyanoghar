import type { createProviderSchema, providerSearchSchema } from "@nyanoghar/contracts";
import { NotFoundError } from "@nyanoghar/errors";
import { and, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../../../db/client.js";
import {
  openingHours,
  type ProviderRow,
  providers,
  services,
  verificationDocuments,
} from "../../../db/schema/index.js";

/**
 * Inputs are derived from the Zod contracts and the Drizzle schema rather
 * than restated by hand, so a change to either surfaces here at compile time
 * instead of drifting silently.
 */
export type ProviderSearchInput = z.infer<typeof providerSearchSchema> & {
  page: number;
  perPage: number;
};

export type CreateProviderInput = z.infer<typeof createProviderSchema>;

export type CreateServiceInput = Pick<
  typeof services.$inferInsert,
  "name" | "category" | "description" | "currency" | "durationMinutes"
> & {
  // Exposed to callers as numbers; numeric columns round-trip as strings.
  priceMin: number | null;
  priceMax: number | null;
};

export interface VerificationDocumentInput {
  documentType: string;
  url: string;
}

export class ProvidersService {
  // No config dependency today; add one if this service starts needing it.
  constructor(private readonly db: Database) {}

  /**
   * Discovery search. Unverified providers are hidden when `verifiedOnly` is
   * set, so the default listing only surfaces businesses an admin has checked.
   */
  async search(query: ProviderSearchInput): Promise<ProviderRow[]> {
    const filters: SQL[] = [isNull(providers.deletedAt)];

    if (query.verifiedOnly) {
      filters.push(eq(providers.verificationStatus, "VERIFIED"));
    }
    if (query.kind) filters.push(eq(providers.kind, query.kind));
    if (query.emergencyOnly) filters.push(eq(providers.emergencyAvailable, true));
    if (query.province) filters.push(eq(providers.province, query.province));
    if (query.district) filters.push(eq(providers.district, query.district));

    if (query.q) {
      const term = `%${query.q}%`;
      filters.push(
        sql`(${providers.name} ilike ${term} or ${providers.description} ilike ${term})`,
      );
    }

    // Bounding box rather than a true radius: PostGIS is installed but no
    // geography column is in use yet, so this is approximate and degrades
    // with latitude.
    if (query.latitude !== undefined && query.longitude !== undefined) {
      const radius = query.radiusKm ?? 25;
      const latDelta = radius / 111;
      const lngDelta =
        radius / (111 * Math.max(Math.cos((query.latitude * Math.PI) / 180), 0.01));

      filters.push(gte(providers.latitude, query.latitude - latDelta));
      filters.push(lte(providers.latitude, query.latitude + latDelta));
      filters.push(gte(providers.longitude, query.longitude - lngDelta));
      filters.push(lte(providers.longitude, query.longitude + lngDelta));
    }

    const order =
      query.sort === "NEAREST" && query.latitude !== undefined
        ? [
            sql`(
              (${providers.latitude} - ${query.latitude}) ^ 2 +
              (${providers.longitude} - ${query.longitude}) ^ 2
            ) asc`,
          ]
        : query.sort === "RATING"
          ? [desc(providers.ratingAverage), desc(providers.ratingCount)]
          : [desc(providers.createdAt)];

    return this.db
      .select()
      .from(providers)
      .where(and(...filters))
      .orderBy(...order)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage);
  }

  /** Public profile with services, hours, branches and practitioners. */
  async findById(providerId: string) {
    const provider = await this.db.query.providers.findFirst({
      where: and(eq(providers.id, providerId), isNull(providers.deletedAt)),
      with: {
        services: true,
        openingHours: true,
        branches: true,
        practitioners: true,
      },
    });

    if (!provider) throw new NotFoundError("Provider");
    return provider;
  }

  /**
   * Loads a provider the caller owns. Used before any mutation so a business
   * owner cannot edit someone else's profile.
   */
  private async loadOwned(providerId: string, ownerId: string): Promise<ProviderRow> {
    const provider = await this.db.query.providers.findFirst({
      where: and(eq(providers.id, providerId), eq(providers.ownerId, ownerId)),
    });

    if (!provider) throw new NotFoundError("Provider");
    return provider;
  }

  async create(
    ownerId: string,
    body: CreateProviderInput,
  ): Promise<ProviderRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [provider] = await tx
        .insert(providers)
        .values({
          ownerId,
          kind: body.kind,
          name: body.name,
          description: body.description,
          registrationNumber: body.registrationNumber,
          phone: body.phone,
          email: body.email,
          website: body.website,
          country: body.location.country,
          province: body.location.province,
          district: body.location.district,
          municipality: body.location.municipality,
          area: body.location.area,
          latitude: body.location.latitude,
          longitude: body.location.longitude,
          emergencyAvailable: body.emergencyAvailable,
          emergencyPhone: body.emergencyPhone,
          // Always starts unverified — an admin must review documents.
          verificationStatus: "UNVERIFIED",
        })
        .returning();

      if (provider && body.openingHours.length > 0) {
        await tx.insert(openingHours).values(
          body.openingHours.map((hours) => ({
            providerId: provider.id,
            branchId: null,
            weekday: hours.weekday,
            opensAt: hours.opensAt,
            closesAt: hours.closesAt,
          })),
        );
      }

      return provider;
    });
  }

  async addService(providerId: string, ownerId: string, body: CreateServiceInput) {
    const provider = await this.loadOwned(providerId, ownerId);

    const [created] = await this.db
      .insert(services)
      .values({
        providerId: provider.id,
        name: body.name,
        category: body.category,
        description: body.description,
        // numeric columns round-trip as strings in postgres-js.
        priceMin: body.priceMin === null ? null : String(body.priceMin),
        priceMax: body.priceMax === null ? null : String(body.priceMax),
        currency: body.currency,
        durationMinutes: body.durationMinutes,
      })
      .returning();

    return created;
  }

  /**
   * Attaches verification documents and moves the provider to PENDING so it
   * enters the moderation queue.
   */
  async submitVerification(
    providerId: string,
    ownerId: string,
    documents: VerificationDocumentInput[],
  ): Promise<{ status: "PENDING" }> {
    const provider = await this.loadOwned(providerId, ownerId);

    await this.db.transaction(async (tx) => {
      await tx.insert(verificationDocuments).values(
        documents.map((document) => ({
          providerId: provider.id,
          documentType: document.documentType,
          url: document.url,
        })),
      );

      await tx
        .update(providers)
        .set({ verificationStatus: "PENDING", updatedAt: new Date() })
        .where(eq(providers.id, provider.id));
    });

    return { status: "PENDING" };
  }

  /** Moderator/admin decision. Records who decided, as spec §18 requires. */
  async decideVerification(
    providerId: string,
    moderatorId: string,
    decision: "VERIFIED" | "REJECTED",
    reason?: string,
  ): Promise<ProviderRow> {
    const [updated] = await this.db
      .update(providers)
      .set({
        verificationStatus: decision,
        verifiedAt: decision === "VERIFIED" ? new Date() : null,
        verifiedBy: moderatorId,
        rejectionReason: decision === "REJECTED" ? (reason ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, providerId))
      .returning();

    if (!updated) throw new NotFoundError("Provider");

    // TODO(events): publish provider.verified so discovery caches refresh.
    return updated;
  }
}
