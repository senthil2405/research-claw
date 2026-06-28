"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getClaudeAuthStatus,
  startClaudeLogin,
  submitClaudeCode,
  claudeLogout,
} from "@/api/claudeAuth";
import type { ClaudeAuthStatus, ClaudeLoginStart } from "@/lib/types";

const CLAUDE_AUTH_QUERY_KEY = ["claudeAuth"] as const;

/** Read whether the current user has authorized their Claude account. */
export function useClaudeAuth(): UseQueryResult<ClaudeAuthStatus> {
  return useQuery({
    queryKey: CLAUDE_AUTH_QUERY_KEY,
    queryFn: getClaudeAuthStatus,
  });
}

/** Begin the login flow. Returns the authorization URL; no cache change. */
export function useStartClaudeLogin(): UseMutationResult<
  ClaudeLoginStart,
  Error,
  void
> {
  return useMutation<ClaudeLoginStart, Error, void>({
    mutationFn: () => startClaudeLogin(),
  });
}

/** Submit the code Anthropic shows the user. Seeds the cache on success. */
export function useSubmitClaudeCode(): UseMutationResult<
  ClaudeAuthStatus,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<ClaudeAuthStatus, Error, string>({
    mutationFn: (code: string) => submitClaudeCode(code),
    onSuccess: (status) => {
      queryClient.setQueryData(CLAUDE_AUTH_QUERY_KEY, status);
      void queryClient.invalidateQueries({ queryKey: CLAUDE_AUTH_QUERY_KEY });
    },
  });
}

/** Disconnect the user's authorized Claude account. */
export function useClaudeLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => claudeLogout(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAUDE_AUTH_QUERY_KEY });
    },
  });
}
