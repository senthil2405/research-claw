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

/** Max length of a chat question (guards prompt size + DB growth). */
export const MAX_QUESTION_CHARS = 16_000;

/** Max length of a highlight's selected passage. */
export const MAX_SELECTED_TEXT_CHARS = 20_000;

/** Max number of rects a single highlight may carry. */
export const MAX_HIGHLIGHT_RECTS = 500;

/** Rate-limit window (ms) for the fixed-window limiter. */
export const RATE_WINDOW_MS = 60_000;
/** Chat (LLM-spend) limits per minute — primary abuse/cost guard. */
export const CHAT_RATE_PER_OWNER = 20;
export const CHAT_RATE_PER_IP = 40;
/** Upload limits per minute. */
export const UPLOAD_RATE_PER_OWNER = 12;
/** Secret-handling routes (claude key/auth) limits per minute. */
export const SECRET_RATE_PER_OWNER = 12;

/** Whether the dev-only mock login is enabled. */
export const ALLOW_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "true";

/** Fixed identity used by the dev mock login. */
export const DEV_USER = {
  id: "dev-user",
  name: "Test User",
  email: "test.user@research-claw.dev",
  image: null as string | null,
};
