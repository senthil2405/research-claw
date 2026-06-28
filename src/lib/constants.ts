// Shared constants used by both the client and server.

/** httpOnly cookie holding the anonymous-session id for logged-out owners. */
export const ANON_COOKIE = "rc_anon";

/** Accepted upload MIME type. */
export const PDF_MIME = "application/pdf";

/** PDF magic bytes: "%PDF-" */
export const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/** Max upload size in bytes (mirrors MAX_UPLOAD_BYTES env; default 25 MB). */
export const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_UPLOAD_BYTES ?? 26214400,
);

/** Whether the dev-only mock login is enabled. */
export const ALLOW_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "true";

/** Fixed identity used by the dev mock login. */
export const DEV_USER = {
  id: "dev-user",
  name: "Test User",
  email: "test.user@research-claw.dev",
  image: null as string | null,
};
