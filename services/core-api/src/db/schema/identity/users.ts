import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { identitySchema } from "./_schema.js";

export const roleEnum = pgEnum("role", [
  "ADOPTER",
  "PET_OWNER",
  "ORGANIZATION",
  "VETERINARIAN",
  "PET_SHOP",
  "MODERATOR",
  "ADMIN",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "BANNED",
  "DELETED",
]);

export const languageEnum = pgEnum("language", ["en", "ne"]);

export const users = identitySchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Either email or phone may be the primary identifier — Nepali users
    // frequently register with a phone number only.
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),

    // Null for accounts created purely through Google/Apple sign-in.
    passwordHash: text("password_hash"),

    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    preferredLanguage: languageEnum("preferred_language").notNull().default("en"),

    country: text("country").notNull().default("NP"),
    province: text("province"),
    district: text("district"),
    municipality: text("municipality"),
    area: text("area"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    status: accountStatusEnum("status").notNull().default("PENDING_VERIFICATION"),

    // Consecutive failed logins; reset to 0 on success.
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    twoFactorSecret: text("two_factor_secret"),

    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }),
    acceptedTermsVersion: text("accepted_terms_version"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete: rows are retained so adoption history stays intact.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Partial unique indexes let a soft-deleted user's email be reused.
    // Partial predicates keep the index scoped to live rows.
    uniqueIndex("users_email_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("users_phone_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} is null`),
    index("users_status_idx").on(table.status),
    index("users_location_idx").on(table.province, table.district),
  ],
);

export const userRoles = identitySchema.table(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("user_roles_unique").on(table.userId, table.role),
    index("user_roles_user_idx").on(table.userId),
  ],
);

export const notificationPreferences = identitySchema.table(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    newApplicationAlerts: boolean("new_application_alerts").notNull().default(true),
    messageAlerts: boolean("message_alerts").notNull().default(true),
    appointmentReminders: boolean("appointment_reminders").notNull().default(true),
    marketingEmails: boolean("marketing_emails").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles),
  notificationPreferences: one(notificationPreferences, {
    fields: [users.id],
    references: [notificationPreferences.userId],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type UserRoleRow = typeof userRoles.$inferSelect;
