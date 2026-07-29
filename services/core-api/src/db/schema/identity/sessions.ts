import { relations } from "drizzle-orm";
import { index, pgEnum, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identitySchema } from "./_schema.js";
import { users } from "./users.js";

export const devicePlatformEnum = pgEnum("device_platform", [
  "IOS",
  "ANDROID",
  "WEB",
  "UNKNOWN",
]);

/**
 * One row per logged-in device. The refresh token itself is never stored —
 * only a SHA-256 hash, so a database leak cannot be replayed as a login.
 */
export const sessions = identitySchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    refreshTokenHash: text("refresh_token_hash").notNull(),

    devicePlatform: devicePlatformEnum("device_platform").notNull().default("UNKNOWN"),
    deviceName: text("device_name"),
    deviceId: text("device_id"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Set when the token is rotated or the session is explicitly revoked.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    // Points at the session that superseded this one, so a replayed old token
    // can be traced to the whole chain and the family revoked.
    rotatedToId: uuid("rotated_to_id"),
  },
  (table) => [
    uniqueIndex("sessions_refresh_hash_unique").on(table.refreshTokenHash),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
