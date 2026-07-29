import { describe, expect, it } from "vitest";
import {
  constantTimeEquals,
  generateOtp,
  generateRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./crypto.js";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("CorrectHorse1");
    await expect(verifyPassword(hash, "CorrectHorse1")).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorse1");
    await expect(verifyPassword(hash, "WrongHorse1")).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });

  it("produces a different hash for the same input", async () => {
    const [a, b] = await Promise.all([
      hashPassword("CorrectHorse1"),
      hashPassword("CorrectHorse1"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("token helpers", () => {
  it("generates unique refresh tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(100);
  });

  it("hashes deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates zero-padded six digit OTPs", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe("constantTimeEquals", () => {
  it("matches identical strings", () => {
    expect(constantTimeEquals("token", "token")).toBe(true);
  });

  it("rejects different strings and differing lengths", () => {
    expect(constantTimeEquals("token", "toker")).toBe(false);
    expect(constantTimeEquals("token", "tokens")).toBe(false);
  });
});
