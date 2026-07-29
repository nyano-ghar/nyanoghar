import { roleSchema } from "@nyanoghar/auth";
import { languageSchema, uuidSchema } from "@nyanoghar/contracts";
import { z } from "zod";

/**
 * Nepali mobile numbers are 10 digits starting with 97/98, but the platform
 * accepts any E.164 number so diaspora adopters can register.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number in international format");

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number");

export const registerBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    preferredLanguage: languageSchema.default("en"),
    // Adopter is the default; owners upgrade their role after verification.
    role: roleSchema.default("ADOPTER"),
    acceptedTermsVersion: z.string().min(1),
    deviceId: z.string().max(200).optional(),
    deviceName: z.string().max(120).optional(),
    devicePlatform: z.enum(["IOS", "ANDROID", "WEB", "UNKNOWN"]).default("UNKNOWN"),
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "Provide an email address or a phone number",
    path: ["email"],
  })
  .refine(
    // Self-assigning a privileged role at signup must never be possible.
    (body) => !["ADMIN", "MODERATOR"].includes(body.role),
    { message: "This role cannot be selected during registration", path: ["role"] },
  );

export const loginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(1),
    deviceId: z.string().max(200).optional(),
    deviceName: z.string().max(120).optional(),
    devicePlatform: z.enum(["IOS", "ANDROID", "WEB", "UNKNOWN"]).default("UNKNOWN"),
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "Provide an email address or a phone number",
    path: ["email"],
  });

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(20).optional(),
  /** When true every session for the user is revoked, not just this device. */
  allDevices: z.boolean().default(false),
});

export const requestVerificationBodySchema = z.object({
  channel: z.enum(["EMAIL", "PHONE"]),
});

export const confirmVerificationBodySchema = z.object({
  channel: z.enum(["EMAIL", "PHONE"]),
  token: z.string().min(4).max(200),
});

export const forgotPasswordBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: phoneSchema.optional(),
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "Provide an email address or a phone number",
    path: ["email"],
  });

export const resetPasswordBodySchema = z.object({
  token: z.string().min(4).max(200),
  password: passwordSchema,
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const authUserSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleSchema),
  status: z.string(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  preferredLanguage: languageSchema,
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
});

export const authResponseSchema = z.object({
  user: authUserSchema,
  tokens: authTokensSchema,
});

export const sessionSummarySchema = z.object({
  id: uuidSchema,
  devicePlatform: z.string(),
  deviceName: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastUsedAt: z.date(),
  createdAt: z.date(),
  expiresAt: z.date(),
  isCurrent: z.boolean(),
});

export const messageResponseSchema = z.object({ message: z.string() });

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
