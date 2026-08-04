import type {
  ConfirmUploadInput,
  CreateUploadUrlInput,
  MediaItem,
  UploadTicket,
} from "@nyanoghar/contracts";
import { BadRequestError, ConflictError, NotFoundError } from "@nyanoghar/errors";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Config } from "../../../config.js";
import type { Database } from "../../../db/client.js";
import { petMedia, pets } from "../../../db/schema/catalog/pets.js";
import {
  buildPetMediaKey,
  isKeyForPet,
  isPrivateKey,
} from "../../../lib/media/keys.js";
import type { MediaStorage } from "../../../lib/media/storage.js";

type PetMediaRow = typeof petMedia.$inferSelect;

/**
 * Pet media, uploaded directly to S3.
 *
 * The flow is three steps because the bytes never pass through this service:
 *
 *   1. presign — authorize one upload to one server-chosen key
 *   2. client PUTs to S3
 *   3. confirm — write the row
 *
 * Step 3 exists because step 2 can fail silently from our point of view. A row
 * written at step 1 would leave phantom media for every abandoned upload.
 */
export class MediaService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
    private readonly storage: MediaStorage,
  ) {}

  /** Confirms the caller owns the listing before anything is signed. */
  private async assertOwnedPet(petId: string, ownerId: string) {
    const pet = await this.db.query.pets.findFirst({
      where: and(eq(pets.id, petId), eq(pets.ownerId, ownerId), isNull(pets.deletedAt)),
    });
    if (!pet) throw new NotFoundError("Pet");
    return pet;
  }

  private async countMedia(petId: string): Promise<number> {
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(petMedia)
      .where(eq(petMedia.petId, petId));
    return count;
  }

  /**
   * Step 1. Authorizes exactly one upload.
   *
   * The quota is checked here as well as at confirm time: signing an unbounded
   * number of URLs would let a caller push objects into the bucket that no row
   * ever references, and which nothing would clean up.
   */
  async createUploadUrl(
    petId: string,
    ownerId: string,
    input: CreateUploadUrlInput,
  ): Promise<UploadTicket> {
    await this.assertOwnedPet(petId, ownerId);

    if (input.sizeBytes > this.config.MEDIA_MAX_UPLOAD_BYTES) {
      throw new BadRequestError(
        `Uploads are limited to ${this.config.MEDIA_MAX_UPLOAD_BYTES} bytes`,
      );
    }

    if ((await this.countMedia(petId)) >= this.config.MAX_MEDIA_PER_PET) {
      throw new ConflictError(
        `A listing can hold at most ${this.config.MAX_MEDIA_PER_PET} media items`,
      );
    }

    const isPrivate = input.visibility === "PRIVATE";
    const key = buildPetMediaKey(
      { petId, visibility: input.visibility },
      input.contentType,
    );

    const presigned = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      isPrivate,
    });

    return {
      uploadUrl: presigned.uploadUrl,
      key,
      requiredHeaders: presigned.requiredHeaders,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /**
   * Step 2. Writes the row once the object is in S3.
   *
   * The key is re-derived rather than trusted: `isKeyForPet` is what stops a
   * caller confirming a key belonging to someone else's listing, which would
   * otherwise attach another owner's photo to their own.
   */
  async confirmUpload(
    petId: string,
    ownerId: string,
    input: ConfirmUploadInput,
  ): Promise<MediaItem> {
    await this.assertOwnedPet(petId, ownerId);

    if (!isKeyForPet(input.key, petId)) {
      throw new BadRequestError("key does not belong to this listing");
    }

    const isPrivate = isPrivateKey(input.key);
    const bucket = this.storage.bucketFor(isPrivate);

    const existing = await this.db.query.petMedia.findFirst({
      where: and(eq(petMedia.bucket, bucket), eq(petMedia.key, input.key)),
    });
    // Confirm is idempotent: a client retrying after a dropped response must
    // not create a second row for one object.
    if (existing) return this.toMediaItem(existing);

    if ((await this.countMedia(petId)) >= this.config.MAX_MEDIA_PER_PET) {
      throw new ConflictError(
        `A listing can hold at most ${this.config.MAX_MEDIA_PER_PET} media items`,
      );
    }

    const kind = kindForKey(input.key);

    const [created] = await this.db
      .insert(petMedia)
      .values({
        petId,
        kind,
        bucket,
        key: input.key,
        position: input.position,
        isPrivate,
      })
      .returning();

    return this.toMediaItem(created!);
  }

  /**
   * Media for a listing, with URLs built at read time.
   *
   * Private objects are only ever returned to the owner, and only as a
   * short-lived signed GET — never a CDN URL.
   */
  async listForPet(petId: string, viewerId: string | undefined): Promise<MediaItem[]> {
    const pet = await this.db.query.pets.findFirst({
      where: and(eq(pets.id, petId), isNull(pets.deletedAt)),
    });
    if (!pet) throw new NotFoundError("Pet");

    const isOwner = viewerId !== undefined && pet.ownerId === viewerId;

    const rows = await this.db
      .select()
      .from(petMedia)
      .where(
        isOwner
          ? eq(petMedia.petId, petId)
          : and(eq(petMedia.petId, petId), eq(petMedia.isPrivate, false)),
      )
      .orderBy(petMedia.position);

    return Promise.all(rows.map((row) => this.toMediaItem(row)));
  }

  async remove(petId: string, ownerId: string, mediaId: string): Promise<void> {
    await this.assertOwnedPet(petId, ownerId);

    const [deleted] = await this.db
      .delete(petMedia)
      .where(and(eq(petMedia.id, mediaId), eq(petMedia.petId, petId)))
      .returning();

    if (!deleted) throw new NotFoundError("Media");
    // The S3 object is intentionally left in place: a lifecycle rule reclaims
    // unreferenced objects, and deleting here would make the API's response
    // depend on a second network call that can fail after the row is gone.
  }

  /**
   * Row to response. This is the only place a URL is produced, which is what
   * keeps the CDN domain out of the database.
   */
  private async toMediaItem(row: PetMediaRow): Promise<MediaItem> {
    if (row.isPrivate) {
      const signed = await this.storage.presignDownload(row.key);
      return {
        id: row.id,
        kind: row.kind,
        url: signed.url,
        thumbnailUrl: null,
        position: row.position,
        isPrivate: true,
        expiresInSeconds: signed.expiresInSeconds,
      };
    }

    return {
      id: row.id,
      kind: row.kind,
      url: this.storage.publicUrl(row.key),
      thumbnailUrl: row.thumbnailKey ? this.storage.publicUrl(row.thumbnailKey) : null,
      position: row.position,
      isPrivate: false,
      expiresInSeconds: null,
    };
  }
}

/** Media kind implied by the extension the server itself assigned. */
function kindForKey(key: string): "IMAGE" | "VIDEO" | "DOCUMENT" {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "pdf") return "DOCUMENT";
  if (extension === "mp4" || extension === "mov") return "VIDEO";
  return "IMAGE";
}
