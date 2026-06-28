import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Symmetric encryption for secrets at rest (the user's Anthropic API key).
// AES-256-GCM. The key is taken from APP_ENCRYPTION_KEY (base64, 32 bytes) when
// set, otherwise derived from AUTH_SECRET. For production, set a dedicated
// APP_ENCRYPTION_KEY managed by your secrets store.

function encryptionKey(): Buffer {
  const explicit = process.env.APP_ENCRYPTION_KEY;
  if (explicit) {
    const buf = Buffer.from(explicit, "base64");
    if (buf.length === 32) return buf;
    // Fall through to hashing if it isn't a clean 32-byte base64 value.
    return createHash("sha256").update(explicit).digest();
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Cannot encrypt secrets: set APP_ENCRYPTION_KEY or AUTH_SECRET",
    );
  }
  return createHash("sha256").update(`${secret}:anthropic-key`).digest();
}

/** Encrypt a plaintext secret. Returns "v1:<iv b64>:<tag b64>:<ct b64>". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Throws on tamper/format error. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed ciphertext");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

/** Last 4 chars of a key, for non-sensitive display ("••••abcd"). */
export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}
