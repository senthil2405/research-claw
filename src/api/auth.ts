// Auth data access: the /api/me query plus thin wrappers around the
// next-auth/react redirect helpers. We read auth *state* via React Query
// against /api/me, and only use next-auth for the sign-in/out redirect flows.

import { signIn, signOut } from "next-auth/react";
import { apiGet } from "@/lib/apiClient";
import type { MeResponse } from "@/lib/types";

/** Fetch the current session user. */
export async function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>("/api/me");
}

/** Sign in using the local "dev" credentials provider, returning to "/". */
export function signInDev() {
  return signIn("dev", { callbackUrl: "/" });
}

/** Sign in with Google, returning to "/". */
export function signInGoogle() {
  return signIn("google", { callbackUrl: "/" });
}

/** Sign out and return to "/". */
export function signOutUser() {
  return signOut({ callbackUrl: "/" });
}
