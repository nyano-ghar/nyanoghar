import { Role, type Role as RoleType, signAccessToken } from "@nyanoghar/auth";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from "@nyanoghar/errors";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Config } from "../../../config.js";
import type { Database } from "../../../db/client.js";
import {
  notificationPreferences,
  securityEvents,
  sessions,
  type UserRow,
  userRoles,
  users,
  verificationTokens,
} from "../../../db/schema/index.js";
import {
  fakePasswordVerification,
  generateOtp,
  generateRefreshToken,
  generateUrlToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../../../lib/crypto.js";
import type { AuthResponse, LoginBody, RegisterBody } from "./auth.schema.js";

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DeviceInfo {
  deviceId?: string | undefined;
  deviceName?: string | undefined;
  devicePlatform: "IOS" | "ANDROID" | "WEB" | "UNKNOWN";
}

/** Parses a `jose` duration string like "15m" into seconds for the client. */
function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return value * multiplier;
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
  ) {}

  // ---------------------------------------------------------------- helpers

  private async recordEvent(
    userId: string | null,
    event: (typeof securityEvents.$inferInsert)["event"],
    context: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityEvents).values({
      userId,
      event,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  private async loadRoles(userId: string): Promise<RoleType[]> {
    const rows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return rows.map((row) => row.role as RoleType);
  }

  private toPublicUser(user: UserRow, roles: RoleType[]): AuthResponse["user"] {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      roles,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      phoneVerified: user.phoneVerifiedAt !== null,
      preferredLanguage: user.preferredLanguage,
    };
  }

  /**
   * Issues an access/refresh pair and persists the session. Oldest sessions
   * beyond MAX_SESSIONS_PER_USER are revoked so a stolen device list stays
   * bounded.
   */
  private async issueTokens(
    user: UserRow,
    roles: RoleType[],
    device: DeviceInfo,
    context: RequestContext,
  ): Promise<AuthResponse["tokens"]> {
    const active = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, user.id),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(sessions.lastUsedAt));

    const overflow = active.length - this.config.MAX_SESSIONS_PER_USER + 1;
    if (overflow > 0) {
      const evict = active.slice(0, overflow).map((row) => row.id);
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "SESSION_LIMIT" })
        .where(sql`${sessions.id} in ${evict}`);
    }

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(
      Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    );

    const [session] = await this.db
      .insert(sessions)
      .values({
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        devicePlatform: device.devicePlatform,
        deviceName: device.deviceName ?? null,
        deviceId: device.deviceId ?? null,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt,
      })
      .returning();

    if (!session) throw new Error("Failed to create session");

    const accessToken = await signAccessToken(
      {
        sub: user.id,
        roles,
        sid: session.id,
        emailVerified: user.emailVerifiedAt !== null,
        phoneVerified: user.phoneVerifiedAt !== null,
      },
      {
        secret: this.config.JWT_ACCESS_SECRET,
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        ttl: this.config.JWT_ACCESS_TTL,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: ttlToSeconds(this.config.JWT_ACCESS_TTL),
    };
  }

  private assertLoginAllowed(user: UserRow): void {
    if (user.status === "BANNED") {
      throw new ForbiddenError("This account has been banned");
    }
    if (user.status === "SUSPENDED") {
      throw new ForbiddenError("This account is suspended");
    }
    if (user.status === "DELETED" || user.deletedAt !== null) {
      throw new UnauthorizedError("Invalid credentials");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenError(
        "Too many failed attempts. Try again after a few minutes.",
      );
    }
  }

  // ------------------------------------------------------------- public API

  async register(
    body: RegisterBody,
    device: DeviceInfo,
    context: RequestContext,
  ): Promise<AuthResponse> {
    const existing = await this.db.query.users.findFirst({
      where: and(
        body.email ? eq(users.email, body.email) : eq(users.phone, body.phone!),
        isNull(users.deletedAt),
      ),
    });

    if (existing) {
      throw new ConflictError(
        "An account with these details already exists. Try signing in instead.",
      );
    }

    const passwordHash = await hashPassword(body.password);
    const now = new Date();

    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: body.email ?? null,
          phone: body.phone ?? null,
          passwordHash,
          fullName: body.fullName,
          preferredLanguage: body.preferredLanguage,
          status: "PENDING_VERIFICATION",
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          acceptedTermsVersion: body.acceptedTermsVersion,
        })
        .returning();

      if (!created) throw new Error("Failed to create user");

      await tx.insert(userRoles).values({ userId: created.id, role: body.role });
      await tx.insert(notificationPreferences).values({ userId: created.id });

      return created;
    });

    const roles = [body.role];
    const tokens = await this.issueTokens(user, roles, device, context);

    // The caller is responsible for dispatching the message; the token row is
    // created here so the flow is atomic with registration.
    await this.createVerificationToken(
      user.id,
      body.email ? "EMAIL_VERIFICATION" : "PHONE_VERIFICATION",
      body.email ?? body.phone!,
    );

    return { user: this.toPublicUser(user, roles), tokens };
  }

  async login(
    body: LoginBody,
    device: DeviceInfo,
    context: RequestContext,
  ): Promise<AuthResponse> {
    const user = await this.db.query.users.findFirst({
      where: and(
        body.email ? eq(users.email, body.email) : eq(users.phone, body.phone!),
        isNull(users.deletedAt),
      ),
    });

    if (!user?.passwordHash) {
      // Equalise timing so a missing account is indistinguishable from a
      // wrong password.
      await fakePasswordVerification();
      await this.recordEvent(null, "LOGIN_FAILED", context, {
        identifier: body.email ?? body.phone,
      });
      throw new UnauthorizedError("Invalid credentials");
    }

    this.assertLoginAllowed(user);

    const valid = await verifyPassword(user.passwordHash, body.password);

    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= this.config.LOGIN_MAX_ATTEMPTS;

      await this.db
        .update(users)
        .set({
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + this.config.LOGIN_LOCKOUT_MINUTES * 60_000)
            : user.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await this.recordEvent(user.id, "LOGIN_FAILED", context, { attempts });
      if (shouldLock) {
        await this.recordEvent(user.id, "ACCOUNT_LOCKED", context, { attempts });
      }

      throw new UnauthorizedError("Invalid credentials");
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const roles = await this.loadRoles(user.id);
    const tokens = await this.issueTokens(user, roles, device, context);
    await this.recordEvent(user.id, "LOGIN_SUCCEEDED", context);

    return { user: this.toPublicUser(user, roles), tokens };
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token means the
   * token leaked, so the entire session family is revoked.
   */
  async refresh(
    refreshToken: string,
    device: DeviceInfo,
    context: RequestContext,
  ): Promise<AuthResponse> {
    const tokenHash = hashToken(refreshToken);

    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.refreshTokenHash, tokenHash),
    });

    if (!session) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (session.revokedAt !== null) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "REPLAY_DETECTED" })
        .where(and(eq(sessions.userId, session.userId), isNull(sessions.revokedAt)));

      await this.recordEvent(session.userId, "REFRESH_REPLAY_DETECTED", context, {
        sessionId: session.id,
      });

      throw new UnauthorizedError(
        "This session has been revoked. Please sign in again.",
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedError("Refresh token has expired");
    }

    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
    });

    if (!user) throw new UnauthorizedError("Account no longer exists");
    this.assertLoginAllowed(user);

    const roles = await this.loadRoles(user.id);
    const tokens = await this.issueTokens(user, roles, device, context);

    await this.db
      .update(sessions)
      .set({
        revokedAt: new Date(),
        revokedReason: "ROTATED",
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));

    await this.recordEvent(user.id, "TOKEN_REFRESHED", context);

    return { user: this.toPublicUser(user, roles), tokens };
  }

  async logout(
    userId: string,
    options: { refreshToken?: string | undefined; allDevices: boolean },
    context: RequestContext,
  ): Promise<void> {
    if (options.allDevices) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "USER_LOGOUT_ALL" })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    } else if (options.refreshToken) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "USER_LOGOUT" })
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.refreshTokenHash, hashToken(options.refreshToken)),
          ),
        );
    }

    await this.recordEvent(userId, "LOGOUT", context, {
      allDevices: options.allDevices,
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(sessions.lastUsedAt));

    return rows.map((row) => ({
      id: row.id,
      devicePlatform: row.devicePlatform,
      deviceName: row.deviceName,
      ipAddress: row.ipAddress,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isCurrent: row.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    context: RequestContext,
  ): Promise<void> {
    const result = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "USER_REVOKED" })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });

    if (result.length === 0) throw new NotFoundError("Session");
    await this.recordEvent(userId, "SESSION_REVOKED", context, { sessionId });
  }

  // -------------------------------------------------------- verification

  /**
   * Creates a single-use token. Any earlier unconsumed token for the same
   * purpose is invalidated so only the newest code works.
   */
  async createVerificationToken(
    userId: string,
    purpose:
      | "EMAIL_VERIFICATION"
      | "PHONE_VERIFICATION"
      | "PASSWORD_RESET"
      | "TWO_FACTOR",
    destination: string,
  ): Promise<string> {
    const usesOtp = purpose === "PHONE_VERIFICATION" || purpose === "TWO_FACTOR";
    const token = usesOtp ? generateOtp() : generateUrlToken();

    await this.db.transaction(async (tx) => {
      await tx
        .update(verificationTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(verificationTokens.userId, userId),
            eq(verificationTokens.purpose, purpose),
            isNull(verificationTokens.consumedAt),
          ),
        );

      await tx.insert(verificationTokens).values({
        userId,
        purpose,
        tokenHash: hashToken(token),
        destination,
        expiresAt: new Date(Date.now() + this.config.OTP_TTL_MINUTES * 60_000),
      });
    });

    return token;
  }

  async confirmVerification(
    userId: string,
    channel: "EMAIL" | "PHONE",
    token: string,
    context: RequestContext,
  ): Promise<void> {
    const purpose = channel === "EMAIL" ? "EMAIL_VERIFICATION" : "PHONE_VERIFICATION";

    const record = await this.db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.userId, userId),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.consumedAt),
      ),
    });

    if (!record) throw new UnprocessableError("No pending verification found");

    if (record.expiresAt <= new Date()) {
      throw new UnprocessableError("This code has expired. Request a new one.");
    }

    if (record.attempts >= this.config.OTP_MAX_ATTEMPTS) {
      throw new UnprocessableError("Too many incorrect attempts. Request a new code.");
    }

    if (record.tokenHash !== hashToken(token)) {
      await this.db
        .update(verificationTokens)
        .set({ attempts: record.attempts + 1 })
        .where(eq(verificationTokens.id, record.id));
      throw new UnprocessableError("Invalid verification code");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(verificationTokens)
        .set({ consumedAt: new Date() })
        .where(eq(verificationTokens.id, record.id));

      const verifiedField =
        channel === "EMAIL"
          ? { emailVerifiedAt: new Date() }
          : { phoneVerifiedAt: new Date() };

      await tx
        .update(users)
        .set({
          ...verifiedField,
          // First successful verification activates the account.
          status: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });

    await this.recordEvent(
      userId,
      channel === "EMAIL" ? "EMAIL_VERIFIED" : "PHONE_VERIFIED",
      context,
    );
  }

  // ----------------------------------------------------------- passwords

  /**
   * Always resolves successfully, whether or not the account exists, so this
   * endpoint cannot be used to enumerate registered users. Returns the token
   * only when there is something to send.
   */
  async requestPasswordReset(
    identifier: { email?: string | undefined; phone?: string | undefined },
    context: RequestContext,
  ): Promise<{ token: string; destination: string; userId: string } | null> {
    const user = await this.db.query.users.findFirst({
      where: and(
        identifier.email
          ? eq(users.email, identifier.email)
          : eq(users.phone, identifier.phone!),
        isNull(users.deletedAt),
      ),
    });

    if (!user) return null;

    const destination = identifier.email ?? identifier.phone!;
    const token = await this.createVerificationToken(
      user.id,
      "PASSWORD_RESET",
      destination,
    );

    await this.recordEvent(user.id, "PASSWORD_RESET_REQUESTED", context);
    return { token, destination, userId: user.id };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const record = await this.db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.purpose, "PASSWORD_RESET"),
        isNull(verificationTokens.consumedAt),
      ),
    });

    if (!record || record.expiresAt <= new Date()) {
      throw new UnprocessableError("This reset link is invalid or has expired");
    }

    const passwordHash = await hashPassword(newPassword);

    await this.db.transaction(async (tx) => {
      await tx
        .update(verificationTokens)
        .set({ consumedAt: new Date() })
        .where(eq(verificationTokens.id, record.id));

      await tx
        .update(users)
        .set({
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.userId));

      // A password reset invalidates every existing session.
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "PASSWORD_RESET" })
        .where(and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)));
    });

    await this.recordEvent(record.userId, "PASSWORD_CHANGED", context);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user?.passwordHash) {
      throw new UnprocessableError(
        "This account has no password set. Use social sign-in or reset instead.",
      );
    }

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await hashPassword(newPassword);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Keep the caller signed in, drop everything else.
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            sql`${sessions.id} <> ${currentSessionId}`,
          ),
        );
    });

    await this.recordEvent(userId, "PASSWORD_CHANGED", context);
  }

  async grantRole(
    targetUserId: string,
    role: RoleType,
    grantedBy: string,
    context: RequestContext,
  ): Promise<RoleType[]> {
    if (role === Role.ADMIN) {
      throw new ForbiddenError("Admin role cannot be granted through the API");
    }

    await this.db
      .insert(userRoles)
      .values({ userId: targetUserId, role, grantedBy })
      .onConflictDoNothing();

    await this.recordEvent(targetUserId, "ROLE_GRANTED", context, {
      role,
      grantedBy,
    });

    return this.loadRoles(targetUserId);
  }
}
