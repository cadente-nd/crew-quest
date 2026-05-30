import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    endpoint: e.SPACES_ENDPOINT,
    region: e.SPACES_REGION,
    credentials: { accessKeyId: e.SPACES_KEY, secretAccessKey: e.SPACES_SECRET },
    forcePathStyle: false,
  });
  return client;
}

/** Uploads a buffer and returns the public URL. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const e = env();
  await s3().send(
    new PutObjectCommand({
      Bucket: e.SPACES_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    })
  );
  if (e.SPACES_CDN_BASE_URL) return `${e.SPACES_CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
  // Default DO Spaces object URL: https://<bucket>.<region>.digitaloceanspaces.com/<key>
  const host = e.SPACES_ENDPOINT.replace(/^https?:\/\//, "");
  return `https://${e.SPACES_BUCKET}.${host}/${key}`;
}
