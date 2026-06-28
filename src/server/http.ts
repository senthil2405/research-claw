import { NextResponse } from "next/server";

/** JSON success response helper. */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** JSON error response helper. */
export function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Common error responses. */
export const httpErrors = {
  unauthorized: () => error("Unauthorized", 401),
  notFound: () => error("Not found", 404),
  badRequest: (msg = "Bad request") => error(msg, 400),
  payloadTooLarge: (msg = "File too large") => error(msg, 413),
  unsupportedMediaType: (msg = "Unsupported media type") => error(msg, 415),
  serverError: (msg = "Internal server error") => error(msg, 500),
};
