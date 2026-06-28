"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getClaudeKeyStatus,
  setClaudeKey,
  deleteClaudeKey,
} from "@/api/claudeKey";
import type { ClaudeKeyStatus } from "@/lib/types";

const CLAUDE_KEY_QUERY_KEY = ["claudeKey"] as const;

/** Read the current user's Anthropic key status (connected/last4/updatedAt). */
export function useClaudeKey(): UseQueryResult<ClaudeKeyStatus> {
  return useQuery({
    queryKey: CLAUDE_KEY_QUERY_KEY,
    queryFn: getClaudeKeyStatus,
  });
}

/** Save (or replace) the user's key. Seeds the cache with the fresh status. */
export function useSetClaudeKey(): UseMutationResult<
  ClaudeKeyStatus,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<ClaudeKeyStatus, Error, string>({
    mutationFn: (apiKey: string) => setClaudeKey(apiKey),
    onSuccess: (status) => {
      queryClient.setQueryData(CLAUDE_KEY_QUERY_KEY, status);
      void queryClient.invalidateQueries({ queryKey: CLAUDE_KEY_QUERY_KEY });
    },
  });
}

/** Remove the user's stored key. */
export function useDeleteClaudeKey(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => deleteClaudeKey(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAUDE_KEY_QUERY_KEY });
    },
  });
}
