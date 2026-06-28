// Small same-origin fetch wrapper used by the client data layer.
// All requests send cookies (credentials: "include") so the next-auth
// session is available to the API routes.

import type { ApiError } from "@/lib/types";

/** Root-relative base for all API routes. */
export const API_BASE = "/api";

/** Attempt to read an { error } message from a non-OK response body. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (body && typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Body was empty or not JSON; fall through to the fallback.
  }
  return fallback;
}

/** GET `path`, parse JSON, throw Error(body.error || statusText) on failure. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, res.statusText));
  }
  return (await res.json()) as T;
}

/** POST JSON `body` to `path`, parse JSON, throw Error(body.error || statusText) on failure. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, res.statusText));
  }
  return (await res.json()) as T;
}

/** PUT JSON `body` to `path`, parse JSON, throw Error(body.error || statusText) on failure. */
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, res.statusText));
  }
  return (await res.json()) as T;
}

/** DELETE `path`; resolves on any 2xx (including 204), throws otherwise. */
export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, res.statusText));
  }
}
