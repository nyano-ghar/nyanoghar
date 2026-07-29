import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

/**
 * Argon2id parameters. 19 MiB / 2 passes is the OWASP baseline; raise
 * `memoryCost` before `timeCost` if hardening is needed later.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same CPU as a real verification when the account does not
 * exist, so response timing does not reveal whether an email is registered.
 */
export async function fakePasswordVerification(): Promise<void> {
  await argon2.hash(randomBytes(16).toString("hex"), ARGON_OPTIONS);
}

/** Opaque refresh token: 384 bits of entropy, URL-safe. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

/**
 * Refresh and verification tokens are high-entropy already, so a fast hash is
 * sufficient and keeps lookups indexable — unlike passwords, which need Argon2.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Numeric OTP for SMS delivery. */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return randomInt(0, max).toString().padStart(digits, "0");
}

/** Long random string for emailed verification and reset links. */
export function generateUrlToken(): string {
  return randomBytes(32).toString("base64url");
}
