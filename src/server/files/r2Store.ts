import { PassThrough, type Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  assertSafeStoredName,
  type FileStat,
  type FileStore,
  type SaveResult,
} from "./store";

// Cloudflare R2 is S3-compatible, so we drive it with the AWS S3 SDK pointed at
// the R2 endpoint. Credentials + bucket come from env; the client is created
// lazily so importing this module in local/dev (where R2 isn't configured) is
// harmless — it only fails if an R2 operation is actually attempted.

let client: S3Client | null = null;
let bucket: string | null = null;

function r2(): { client: S3Client; bucket: string } {
  if (client && bucket) return { client, bucket };

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const b = process.env.R2_BUCKET;
  // Explicit endpoint wins; otherwise derive the standard R2 endpoint.
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  const missing = [
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !b && "R2_BUCKET",
    !endpoint && "R2_ENDPOINT or R2_ACCOUNT_ID",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `R2 storage is not configured: missing ${missing.join(", ")}`,
    );
  }

  client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
    },
  });
  bucket = b as string;
  return { client, bucket };
}

/** True for the S3/R2 "object does not exist" responses. */
function isNotFound(err: unknown): boolean {
  const e = err as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

/** Shape an ENOENT-like error so callers that check `.code === "ENOENT"` work. */
function notFoundError(): NodeJS.ErrnoException {
  const e = new Error("File not found") as NodeJS.ErrnoException;
  e.code = "ENOENT";
  return e;
}

export class R2FileStore implements FileStore {
  async save(storedName: string, data: Buffer): Promise<SaveResult> {
    assertSafeStoredName(storedName);
    const { client, bucket } = r2();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storedName,
        Body: data,
        ContentType: "application/pdf",
      }),
    );
    return { sizeBytes: data.length };
  }

  async stat(storedName: string): Promise<FileStat> {
    assertSafeStoredName(storedName);
    const { client, bucket } = r2();
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: storedName }),
      );
      return { size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) throw notFoundError();
      throw err;
    }
  }

  createReadStream(
    storedName: string,
    range?: { start: number; end: number },
  ): Readable {
    assertSafeStoredName(storedName);
    // The S3 GET is async but this method is synchronous (mirrors the local
    // store / fs.createReadStream contract). Return a PassThrough now and pipe
    // the object body into it once the request resolves; errors are surfaced by
    // destroying the stream.
    const pass = new PassThrough();
    const { client, bucket } = r2();
    client
      .send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storedName,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      )
      .then((res) => {
        const body = res.Body as Readable | undefined;
        if (!body) {
          pass.destroy(notFoundError());
          return;
        }
        body.on("error", (e) => pass.destroy(e));
        body.pipe(pass);
      })
      .catch((err) => {
        pass.destroy(isNotFound(err) ? notFoundError() : (err as Error));
      });
    return pass;
  }

  async delete(storedName: string): Promise<void> {
    assertSafeStoredName(storedName);
    const { client, bucket } = r2();
    // S3/R2 DELETE is idempotent — succeeds whether or not the object existed.
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storedName }),
    );
  }
}

export const r2FileStore = new R2FileStore();
