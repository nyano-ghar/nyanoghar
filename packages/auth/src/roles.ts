import { z } from "zod";

/**
 * Platform roles from the product spec (section 6). A single user may hold
 * several roles at once — e.g. an adopter who also runs a pet shop.
 */
export const Role = {
  ADOPTER: "ADOPTER",
  PET_OWNER: "PET_OWNER",
  ORGANIZATION: "ORGANIZATION",
  VETERINARIAN: "VETERINARIAN",
  PET_SHOP: "PET_SHOP",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const roleSchema = z.nativeEnum(Role);

export const ALL_ROLES = Object.values(Role);

/** Roles that can act on moderation and verification queues. */
export const STAFF_ROLES: readonly Role[] = [Role.MODERATOR, Role.ADMIN];

/** Roles permitted to publish pet listings. */
export const LISTING_ROLES: readonly Role[] = [Role.PET_OWNER, Role.ORGANIZATION];

/** Roles that own a verified business profile. */
export const PROVIDER_ROLES: readonly Role[] = [Role.VETERINARIAN, Role.PET_SHOP];

export const AccountStatus = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DELETED: "DELETED",
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const accountStatusSchema = z.nativeEnum(AccountStatus);
