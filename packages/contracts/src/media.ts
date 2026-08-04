import { z } from "zod";
import { mediaKind, uuidSchema } from "./common.js";

/**
 * Media upload contracts (spec sections 15 and 17).
 *
 * Binary data never transits the API. A client asks for a presigned PUT,
 * uploads straight to S3, then confirms so the row is written. The API
 * therefore never sees the bytes and cannot validate them directly — which is
 * why the *declared* content type and size are validated here at presign
 * time, and why the storage key is minted server-side rather than accepted
 * from the client.
 */

/** Exactly what may be uploaded. An allowlist, never a denylist. */
export const uploadContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

/** Which bucket an object belongs in, and so how it is read back. */
export const mediaVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export type MediaVisibility = z.infer<typeof mediaVisibilitySchema>;

/**
 * Content types permitted per media kind. A DOCUMENT must not be an image
 * masquerading as a PDF, and an IMAGE must never be a video.
 */
export const CONTENT_TYPES_BY_KIND: Record<
  z.infer<typeof mediaKind>,
  readonly UploadContentType[]
> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  VIDEO: ["video/mp4", "video/quicktime"],
  DOCUMENT: ["application/pdf", "image/jpeg", "image/png"],
};

/**
 * Step 1: ask for somewhere to upload to.
 *
 * `filename` is used only to pick an extension, and is never trusted as a
 * path — the server generates the key. `sizeBytes` is what the client claims;
 * S3 enforces it independently via the signed content-length.
 */
export const createUploadUrlSchema = z
  .object({
    kind: mediaKind.default("IMAGE"),
    contentType: uploadContentTypeSchema,
    sizeBytes: z.number().int().positive(),
    visibility: mediaVisibilitySchema.default("PUBLIC"),
  })
  .refine((body) => CONTENT_TYPES_BY_KIND[body.kind].includes(body.contentType), {
    message: "contentType is not valid for this media kind",
    path: ["contentType"],
  })
  .refine((body) => body.kind !== "DOCUMENT" || body.visibility === "PRIVATE", {
    // Vaccination cards and health records are documents. Publishing one to
    // the CDN would cache it at edge locations worldwide, where deleting the
    // S3 object does not remove it.
    message: "Documents must be uploaded as PRIVATE",
    path: ["visibility"],
  });

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

export const uploadTicketSchema = z.object({
  /** Where to PUT the bytes. Expires shortly. */
  uploadUrl: z.string().url(),
  /** Opaque storage key; echo it back to confirm. */
  key: z.string().min(1),
  /** Headers that must be sent with the PUT for the signature to match. */
  requiredHeaders: z.record(z.string()),
  expiresInSeconds: z.number().int().positive(),
});

export type UploadTicket = z.infer<typeof uploadTicketSchema>;

/**
 * Step 2: confirm the upload landed, so the row is written.
 *
 * The key must be one this server minted for this caller and pet; it is
 * re-derived and checked rather than trusted.
 */
export const confirmUploadSchema = z.object({
  key: z.string().min(1).max(1024),
  position: z.number().int().nonnegative().default(0),
  /** Only meaningful for images. */
  isPrimary: z.boolean().default(false),
});

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

/**
 * A media row as returned to clients. Note there is no bucket or key: reads
 * expose a URL built at serialization time, so the storage layout stays an
 * implementation detail and the CDN domain is never persisted.
 */
export const mediaItemSchema = z.object({
  id: uuidSchema,
  kind: mediaKind,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  position: z.number().int().nonnegative(),
  isPrivate: z.boolean(),
  /** Present only for private objects, which are read via a signed GET. */
  expiresInSeconds: z.number().int().positive().nullable().default(null),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;
