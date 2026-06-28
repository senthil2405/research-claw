// Data access for the "Authorize Claude" account-login flow. The user signs in
// with their Anthropic account; the server returns only a non-sensitive
// ClaudeAuthStatus (connected/authorizedAt).

import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import type { ClaudeAuthStatus, ClaudeLoginStart } from "@/lib/types";

/** Fetch whether the current user has authorized their Claude account. */
export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
  return apiGet<ClaudeAuthStatus>("/api/me/claude-auth");
}

/** Begin the login flow; returns the authorization URL the user must open. */
export async function startClaudeLogin(): Promise<ClaudeLoginStart> {
  return apiPost<ClaudeLoginStart>("/api/me/claude-auth/start", {});
}

/** Exchange the code Anthropic shows the user for an authorized session. */
export async function submitClaudeCode(code: string): Promise<ClaudeAuthStatus> {
  return apiPost<ClaudeAuthStatus>("/api/me/claude-auth/code", { code });
}

/** Disconnect the user's authorized Claude account. */
export async function claudeLogout(): Promise<void> {
  return apiDelete("/api/me/claude-auth");
}
