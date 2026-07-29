import { Role } from "@nyanoghar/auth";
import { ForbiddenError, NotFoundError } from "@nyanoghar/errors";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { notificationPreferences, userRoles, users } from "../../../db/schema/index.js";

export type UpdateProfileInput = Partial<
  Pick<
    typeof users.$inferInsert,
    | "fullName"
    | "bio"
    | "avatarUrl"
    | "preferredLanguage"
    | "province"
    | "district"
    | "municipality"
    | "area"
    | "latitude"
    | "longitude"
  >
>;

export type UpdateNotificationPrefsInput = Partial<
  Omit<typeof notificationPreferences.$inferInsert, "userId" | "updatedAt">
>;

export class UsersService {
  // No config dependency today; add one if this service starts needing it.
  constructor(private readonly db: Database) {}

  /**
   * Loads a profile with its roles and derived verification booleans.
   *
   * This returns the full record. Restricting what a caller may see is the
   * route's response schema — `publicProfileSchema` picks a subset, and the
   * Zod serializer drops everything else on the way out.
   */
  async getProfile(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
    });
    if (!user) throw new NotFoundError("User");

    const roles = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    return {
      ...user,
      roles: roles.map((row) => row.role),
      emailVerified: user.emailVerifiedAt !== null,
      phoneVerified: user.phoneVerifiedAt !== null,
    };
  }

  async updateProfile(userId: string, patch: UpdateProfileInput) {
    await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return this.getProfile(userId);
  }

  async getNotificationPreferences(userId: string) {
    const prefs = await this.db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, userId),
    });
    if (!prefs) throw new NotFoundError("Preferences");
    return prefs;
  }

  async updateNotificationPreferences(
    userId: string,
    patch: UpdateNotificationPrefsInput,
  ) {
    const [updated] = await this.db
      .update(notificationPreferences)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    if (!updated) throw new NotFoundError("Preferences");
    return updated;
  }

  /**
   * Soft-deletes an account.
   *
   * Adoption history and reviews must outlive the account, so the row stays
   * and only the identifiers are cleared. Email and phone are nulled so the
   * addresses become reusable — the partial unique indexes are scoped to
   * `deleted_at is null`, and leaving the values in place would keep them
   * occupied.
   */
  async softDelete(userId: string, callerRoles: string[]): Promise<void> {
    if (callerRoles.includes(Role.ADMIN)) {
      throw new ForbiddenError("Admin accounts cannot be self-deleted");
    }

    await this.db
      .update(users)
      .set({
        status: "DELETED",
        deletedAt: new Date(),
        email: null,
        phone: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // TODO(events): publish identity.user.deleted so other modules can
    // anonymise their copies of the user's data.
  }
}
