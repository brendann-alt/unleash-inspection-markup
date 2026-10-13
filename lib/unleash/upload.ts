/**
 * Upload a captured frame to Media Drive.
 *
 * Per the developer docs, uploads go directly to the S3 upload bucket with
 * the AWS S3 SDK, tagged with metadata `location`, `name` and `deviceid`.
 * Media Drive then ingests the object and it appears at that location.
 * Bucket name and upload credentials are issued by Unleash live: set them in
 * .env.local (UL_UPLOAD_BUCKET, UL_UPLOAD_REGION, AWS credentials).
 */
import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let s3: S3Client | null = null;
function client() {
  if (!s3) s3 = new S3Client({ region: process.env.UL_UPLOAD_REGION ?? "ap-southeast-2" });
  return s3;
}

export async function uploadFrame(p: { jpeg: Buffer; name: string; location: string; deviceId?: string }) {
  const bucket = process.env.UL_UPLOAD_BUCKET;
  if (!bucket) throw new Error("UL_UPLOAD_BUCKET is not set");
  const key = `${p.location.replace(/^\/+|\/+$/g, "")}/${p.name}`;
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: p.jpeg,
    ContentType: "image/jpeg",
    Metadata: {
      location: p.location,
      name: p.name,
      ...(p.deviceId ? { deviceid: p.deviceId } : {}),
    },
  }));
  return { key };
}
