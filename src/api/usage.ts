// Chat token-budget status access.

import { apiGet } from "@/lib/apiClient";
import type { UsageStatus } from "@/lib/types";

/** Read the current owner's token budget status. */
export async function getUsageStatus(): Promise<UsageStatus> {
  return apiGet<UsageStatus>("/api/me/usage");
}
