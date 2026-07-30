import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UploadContentType } from "@nyanoghar/contracts";
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

export class MediaStorage {
  private readonly client: S3Client;

  constructor(private readonly config: Config) {
    this.client = new S3Client({
      region: config.MEDIA_S3_REGION,
      credentials: {
        accessKeyId: config.MEDIA_S3_ACCESS_KEY_ID,
        secretAccessKey: config.MEDIA_S3_SECRET_ACCESS_KEY,
      },
    });
  }

  bucketFor(isPrivate: boolean): string {
    return isPrivate
      ? this.config.MEDIA_PRIVATE_BUCKET
      : this.config.MEDIA_PUBLIC_BUCKET;
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
  async presignUpload(params: {
    key: string;
    contentType: UploadContentType;
    sizeBytes: number;
    isPrivate: boolean;
  }): Promise<PresignedUpload> {
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
      new GetObjectCommand({ Bucket: this.config.MEDIA_PRIVATE_BUCKET, Key: key }),
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
   */
  publicUrl(key: string): string {
    return `https://${this.config.MEDIA_CDN_DOMAIN}/${key}`;
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
