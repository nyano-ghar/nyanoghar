import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UploadContentType } from "@nyanoghar/contracts";
import { NotImplementedError } from "@nyanoghar/errors";
import type { Config } from "../../config.js";

/**
 * S3 access for media.
 *
 * Two buckets, deliberately: public objects are read through CloudFront and
 * cached at the edge, private ones are read only through short-lived signed
 * GETs and have no CDN origin at all. Keeping them in separate buckets means
 * there is no policy condition to get subtly wrong — a misconfiguration
 * cannot expose a citizenship scan, because the private bucket is not
 * reachable publicly by any path.
 */
export interface PresignedUpload {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignUploadParams {
  key: string;
  contentType: UploadContentType;
  sizeBytes: number;
  isPrivate: boolean;
}

/**
 * The storage contract the media service depends on.
 *
 * Two implementations exist so the repo is runnable without an AWS account:
 * `S3MediaStorage` for real deployments, `StubMediaStorage` when no
 * credentials are configured. The service layer is written against this
 * interface and never branches on which one it holds.
 */
export interface MediaStorage {
  bucketFor(isPrivate: boolean): string;
  presignUpload(params: PresignUploadParams): Promise<PresignedUpload>;
  presignDownload(key: string): Promise<{ url: string; expiresInSeconds: number }>;
  publicUrl(key: string): string;
  close(): Promise<void>;
}

export class S3MediaStorage implements MediaStorage {
  private readonly client: S3Client;
  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly cdnDomain: string;
  private readonly publicScheme: "http" | "https";

  constructor(private readonly config: Config) {
    // Guaranteed present: config.ts refuses to start with a partial S3 set,
    // and this class is only constructed when MEDIA_ENABLED is true.
    this.publicBucket = config.MEDIA_PUBLIC_BUCKET!;
    this.privateBucket = config.MEDIA_PRIVATE_BUCKET!;
    this.cdnDomain = config.MEDIA_CDN_DOMAIN!;
    // Only a local, plain-http endpoint downgrades the scheme. Anything else —
    // real AWS, or a hosted S3-compatible provider — stays on https.
    this.publicScheme = config.MEDIA_S3_ENDPOINT?.startsWith("http://")
      ? "http"
      : "https";

    this.client = new S3Client({
      region: config.MEDIA_S3_REGION,
      credentials: {
        accessKeyId: config.MEDIA_S3_ACCESS_KEY_ID!,
        secretAccessKey: config.MEDIA_S3_SECRET_ACCESS_KEY!,
      },
      // Unset for real AWS. Set, this targets any S3-compatible server —
      // MinIO locally, or R2 / B2 / Spaces in production.
      ...(config.MEDIA_S3_ENDPOINT ? { endpoint: config.MEDIA_S3_ENDPOINT } : {}),
      forcePathStyle: config.MEDIA_S3_FORCE_PATH_STYLE,
    });
  }

  bucketFor(isPrivate: boolean): string {
    return isPrivate ? this.privateBucket : this.publicBucket;
  }

  /**
   * Mint a presigned PUT for exactly one key.
   *
   * `ContentLength` and `ContentType` are part of the signature, so S3 rejects
   * an upload whose size or type differs from what was authorized. This is the
   * enforcement that matters: the API never sees the bytes, so a check that
   * lived only in our code would be advisory. A client cannot declare 1 MB and
   * then upload 5 GB.
   */
  async presignUpload(params: PresignUploadParams): Promise<PresignedUpload> {
    const expiresIn = this.config.MEDIA_UPLOAD_URL_TTL_SECONDS;

    const command = new PutObjectCommand({
      Bucket: this.bucketFor(params.isPrivate),
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.sizeBytes,
      // Objects are never world-readable by ACL. Public reads go through
      // CloudFront with an Origin Access Control, so the bucket itself stays
      // private even for public media.
      ServerSideEncryption: "AES256",
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });

    return {
      uploadUrl,
      // The client must send these verbatim or the signature will not match.
      requiredHeaders: {
        "Content-Type": params.contentType,
        "Content-Length": String(params.sizeBytes),
        "x-amz-server-side-encryption": "AES256",
      },
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * A short-lived signed GET for a private object. Never cached publicly and
   * never handed to CloudFront (spec 7.14, 17).
   */
  async presignDownload(
    key: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresIn = this.config.MEDIA_PRIVATE_URL_TTL_SECONDS;

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.privateBucket, Key: key }),
      { expiresIn },
    );

    return { url, expiresInSeconds: expiresIn };
  }

  /**
   * The CDN URL for a public key, built at read time.
   *
   * Storing keys rather than URLs is what makes this a one-line change if the
   * distribution is ever replaced; baking the domain into rows would leave
   * every historical row pointing at the old one.
   *
   * `MEDIA_CDN_DOMAIN` may name the S3-compatible host itself when there is no
   * CDN in front of it — the local MinIO setup does exactly that — so the
   * scheme is derived from the endpoint rather than hardcoded to https. A
   * plain-http CDN domain is never correct in production; it exists so
   * `http://localhost:9000` works without a TLS certificate.
   */
  publicUrl(key: string): string {
    const scheme = this.publicScheme;
    return `${scheme}://${this.cdnDomain}/${key}`;
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}

/**
 * The driver used when no S3 credentials are configured.
 *
 * This exists so `git clone && pnpm dev` works with no AWS account: identity,
 * catalog, adoption and provider are entirely usable, and only the upload
 * routes are inert. Signing is refused rather than faked — handing back a URL
 * that cannot accept bytes would turn a clear configuration error into a
 * confusing upload failure at the client.
 *
 * Reads still resolve, so listings seeded with media keys render a stable
 * placeholder URL instead of throwing.
 */
export class StubMediaStorage implements MediaStorage {
  static readonly PUBLIC_BUCKET = "local-public";
  static readonly PRIVATE_BUCKET = "local-private";

  private static readonly UNCONFIGURED =
    "Media uploads are disabled: no S3 credentials are configured. " +
    "Set MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY, " +
    "MEDIA_PUBLIC_BUCKET, MEDIA_PRIVATE_BUCKET and MEDIA_CDN_DOMAIN to enable them.";

  bucketFor(isPrivate: boolean): string {
    return isPrivate ? StubMediaStorage.PRIVATE_BUCKET : StubMediaStorage.PUBLIC_BUCKET;
  }

  async presignUpload(): Promise<PresignedUpload> {
    throw new NotImplementedError(StubMediaStorage.UNCONFIGURED);
  }

  /**
   * Private media has no meaningful local representation, but returning a
   * placeholder keeps `GET /pets/:id/media` working for the owner rather than
   * failing the whole listing read over one private row.
   */
  async presignDownload(
    key: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return { url: this.publicUrl(key), expiresInSeconds: 0 };
  }

  publicUrl(key: string): string {
    return `https://media.invalid/${key}`;
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}

/** Picks the driver from configuration. */
export function createMediaStorage(config: Config): MediaStorage {
  return config.MEDIA_ENABLED ? new S3MediaStorage(config) : new StubMediaStorage();
}
