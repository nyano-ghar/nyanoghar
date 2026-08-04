import { randomUUID } from "node:crypto";
import type { MediaVisibility, UploadContentType } from "@nyanoghar/contracts";

/**
 * Storage key derivation.
 *
 * Keys are minted server-side and never accepted from a client. This is the
 * whole defence against path traversal and cross-tenant writes: a presigned
 * PUT grants write access to exactly one key, so if the client chose the key
 * it could overwrite another owner's photo or escape the prefix entirely.
 *
 * Layout: `pets/<petId>/<uuid>.<ext>`
 *
 * The pet id is in the path so a key can be *checked* against the pet and
 * caller at confirm time without a database lookup, and so listing a prefix
 * enumerates exactly one listing's media.
 */

const EXTENSION_BY_CONTENT_TYPE: Record<UploadContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

export interface PetMediaKeyParts {
  petId: string;
  visibility: MediaVisibility;
}

/**
 * A fresh key for a pet media object. The random component means an upload
 * can never overwrite an existing object, so a retry cannot clobber a
 * successful earlier upload.
 */
export function buildPetMediaKey(
  parts: PetMediaKeyParts,
  contentType: UploadContentType,
): string {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  const prefix = parts.visibility === "PRIVATE" ? "private/pets" : "pets";
  return `${prefix}/${parts.petId}/${randomUUID()}.${extension}`;
}

/** Matches only keys this server would have minted for `petId`. */
export function isKeyForPet(key: string, petId: string): boolean {
  // Reject anything that could traverse out of the prefix or confuse S3.
  if (key.includes("..") || key.startsWith("/") || key.includes("//")) return false;
  if (key.length > 1024) return false;

  const pattern = new RegExp(
    `^(private/)?pets/${escapeRegExp(petId)}/[0-9a-f-]{36}\\.[a-z0-9]{2,5}$`,
  );
  return pattern.test(key);
}

/** Whether a key belongs in the private bucket, per its prefix. */
export function isPrivateKey(key: string): boolean {
  return key.startsWith("private/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
