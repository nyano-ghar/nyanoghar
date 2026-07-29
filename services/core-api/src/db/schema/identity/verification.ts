import { index, integer, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { identitySchema } from "./_schema.js";
import { users } from "./users.js";

export const verificationPurposeEnum = pgEnum("verification_purpose", [
  "EMAIL_VERIFICATION",
  "PHONE_VERIFICATION",
  "PASSWORD_RESET",
  "TWO_FACTOR",
]);

/**
 * Short-lived codes and links. Like refresh tokens these are stored hashed;
 * `attempts` guards against brute-forcing a 6-digit OTP.
 */
export const verificationTokens = identitySchema.table(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: verificationPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    // The address the code was sent to, so changing an email mid-flow
    // invalidates the pending verification.
    destination: text("destination").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_tokens_lookup_idx").on(table.userId, table.purpose),
    index("verification_tokens_hash_idx").on(table.tokenHash),
    index("verification_tokens_expiry_idx").on(table.expiresAt),
  ],
);

export const authProviderEnum = pgEnum("auth_provider", ["GOOGLE", "APPLE"]);

/** Links a social identity to a platform user. */
export const oauthIdentities = identitySchema.table(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oauth_identities_provider_idx").on(table.provider, table.providerAccountId),
    index("oauth_identities_user_idx").on(table.userId),
  ],
);

export const securityEventEnum = pgEnum("security_event", [
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "TOKEN_REFRESHED",
  "REFRESH_REPLAY_DETECTED",
  "SESSION_REVOKED",
  "ACCOUNT_LOCKED",
  "ROLE_GRANTED",
  "EMAIL_VERIFIED",
  "PHONE_VERIFIED",
]);

/** Append-only audit trail backing the admin security view. */
export const securityEvents = identitySchema.table(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    event: securityEventEnum("event").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("security_events_user_idx").on(table.userId, table.createdAt),
    index("security_events_type_idx").on(table.event),
  ],
);

export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
export type SecurityEventRow = typeof securityEvents.$inferSelect;
