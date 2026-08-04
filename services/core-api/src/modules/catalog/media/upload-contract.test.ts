import { createUploadUrlSchema } from "@nyanoghar/contracts";
import { describe, expect, it } from "vitest";

/**
 * The presign request is the only place the API can police what goes into the
 * bucket, since the bytes never pass through it. These cases pin the rules
 * that matter.
 */
describe("createUploadUrlSchema", () => {
  const valid = {
    kind: "IMAGE" as const,
    contentType: "image/jpeg" as const,
    sizeBytes: 1024,
    visibility: "PUBLIC" as const,
  };

  it("accepts a well-formed image upload", () => {
    expect(createUploadUrlSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a content type outside the allowlist", () => {
    const result = createUploadUrlSchema.safeParse({
      ...valid,
      contentType: "image/svg+xml",
    });
    // SVG can carry script; it is deliberately not in the allowlist.
    expect(result.success).toBe(false);
  });

  it("rejects a video content type declared as an image", () => {
    const result = createUploadUrlSchema.safeParse({
      ...valid,
      kind: "IMAGE",
      contentType: "video/mp4",
    });
    expect(result.success).toBe(false);
  });

  // Health records and vaccination cards must never reach the CDN, where an
  // edge cache would outlive deletion of the S3 object.
  it("refuses to publish a document", () => {
    const result = createUploadUrlSchema.safeParse({
      kind: "DOCUMENT",
      contentType: "application/pdf",
      sizeBytes: 2048,
      visibility: "PUBLIC",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a private document", () => {
    const result = createUploadUrlSchema.safeParse({
      kind: "DOCUMENT",
      contentType: "application/pdf",
      sizeBytes: 2048,
      visibility: "PRIVATE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive size", () => {
    expect(createUploadUrlSchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(
      false,
    );
    expect(createUploadUrlSchema.safeParse({ ...valid, sizeBytes: -1 }).success).toBe(
      false,
    );
  });

  it("defaults to a public image", () => {
    const result = createUploadUrlSchema.safeParse({
      contentType: "image/png",
      sizeBytes: 512,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("IMAGE");
      expect(result.data.visibility).toBe("PUBLIC");
    }
  });
});
