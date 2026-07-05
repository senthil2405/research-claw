"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getUsageStatus } from "@/api/usage";
import type { UsageStatus } from "@/lib/types";

const USAGE_QUERY_KEY = ["usage"] as const;

/** Read the current owner's chat token budget (used/limit/remaining/plan). */
export function useUsage(): UseQueryResult<UsageStatus> {
  return useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: getUsageStatus,
  });
}
