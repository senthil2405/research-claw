"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/api/auth";
import type { AuthUser } from "@/lib/types";

/**
 * Current-user hook backed by GET /api/me.
 * Returns:
 *  - user: AuthUser | null
 *  - isLoading: boolean
 *  - isAuthenticated: boolean
 *  - refetch: () => void (re-runs the /api/me query)
 */
export function useAuth(): {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
  });

  const user = data?.user ?? null;

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    refetch: () => {
      void refetch();
    },
  };
}
