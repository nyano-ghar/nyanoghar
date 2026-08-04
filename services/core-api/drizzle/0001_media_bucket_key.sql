-- pet_media: store S3 coordinates instead of a URL.
--
-- `url` held a fully-qualified address, which baked the CDN domain into every
-- row and left no way to tell a public object from a private one at read time.
-- Storing bucket + key instead means the URL is derived when serving: public
-- keys become CloudFront URLs, private keys become short-lived signed GETs.
--
-- This is a drop-and-add rather than a rename: a URL and an S3 key are not the
-- same value, so there is nothing to carry across. The table was verified
-- empty (0 rows) before this migration was written, so no backfill is needed.
-- If it were not empty, `key` would have to be derived from `url` first and
-- the NOT NULL added afterwards.
ALTER TABLE "catalog"."pet_media" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" DROP COLUMN "thumbnail_url";--> statement-breakpoint

ALTER TABLE "catalog"."pet_media" ADD COLUMN "bucket" text NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" ADD COLUMN "thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" ADD COLUMN "size_bytes" integer;--> statement-breakpoint

-- One row per stored object. Upload confirmation is idempotent, so a replayed
-- confirm must collide here rather than insert a duplicate.
CREATE UNIQUE INDEX "pet_media_bucket_key_unique" ON "catalog"."pet_media" USING btree ("bucket","key");
