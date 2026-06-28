// Data access for the BYOK Anthropic API key. The server never returns the
// full key — only a non-sensitive ClaudeKeyStatus (connected/last4/updatedAt).

import { apiGet, apiPut, apiDelete } from "@/lib/apiClient";
import type { ClaudeKeyStatus } from "@/lib/types";

/** Fetch the current user's stored-key status. */
export async function getClaudeKeyStatus(): Promise<ClaudeKeyStatus> {
  return apiGet<ClaudeKeyStatus>("/api/me/claude-key");
}

/** Store (or replace) the user's Anthropic API key. */
export async function setClaudeKey(apiKey: string): Promise<ClaudeKeyStatus> {
  return apiPut<ClaudeKeyStatus>("/api/me/claude-key", { apiKey });
}

/** Remove the user's stored Anthropic API key. */
export async function deleteClaudeKey(): Promise<void> {
  return apiDelete("/api/me/claude-key");
}
