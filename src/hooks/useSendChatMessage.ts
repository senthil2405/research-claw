"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendChatMessage } from "@/api/chat";
import type { ChatMessageDTO, SendMessageResponse } from "@/lib/types";

/** Prefix used to recognise (and later remove) optimistic placeholder messages. */
const OPTIMISTIC_PREFIX = "optimistic-";

interface SendContext {
  /** The id of the temporary user message we inserted in onMutate. */
  optimisticId: string;
  /** Snapshot of the cache before the optimistic update, for rollback. */
  previous: ChatMessageDTO[] | undefined;
}

/**
 * Send-message mutation for one window. mutate/mutateAsync take the question
 * string.
 *
 * Optimistic flow:
 *  - onMutate: append a temporary user ChatMessageDTO to the cache so it shows
 *    instantly, and snapshot the previous cache for rollback.
 *  - onError: restore the snapshot (removing the optimistic message).
 *  - onSuccess: drop the optimistic message and append the server's persisted
 *    user + assistant messages, then invalidate to reconcile with the server.
 */
export function useSendChatMessage(documentId: string, highlightId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["messages", documentId, highlightId] as const;

  return useMutation<SendMessageResponse, Error, string, SendContext>({
    mutationFn: (question: string) =>
      sendChatMessage(documentId, highlightId, question),

    onMutate: async (question: string): Promise<SendContext> => {
      // Avoid an in-flight refetch overwriting our optimistic update.
      await queryClient.cancelQueries({ queryKey });

      const previous =
        queryClient.getQueryData<ChatMessageDTO[]>(queryKey);
      const existing = previous ?? [];
      const optimisticId = OPTIMISTIC_PREFIX + Date.now().toString();
      const lastTurn =
        existing.length > 0 ? existing[existing.length - 1].turnIndex : -1;
      const lastSeq =
        existing.length > 0 ? existing[existing.length - 1].seq : -1;

      const optimistic: ChatMessageDTO = {
        id: optimisticId,
        highlightId,
        role: "user",
        content: question,
        highlightText: null,
        turnIndex: lastTurn + 1,
        seq: lastSeq + 1,
        inputTokens: null,
        outputTokens: null,
        durationMs: null,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ChatMessageDTO[]>(queryKey, [
        ...existing,
        optimistic,
      ]);

      return { optimisticId, previous };
    },

    onError: (_err, _question, context) => {
      if (!context) return;
      // Roll back to the pre-optimistic snapshot.
      queryClient.setQueryData<ChatMessageDTO[]>(queryKey, context.previous);
    },

    onSuccess: (data, _question, context) => {
      queryClient.setQueryData<ChatMessageDTO[]>(queryKey, (current) => {
        const base = current ?? [];
        // Remove our optimistic placeholder.
        const withoutOptimistic = context
          ? base.filter((m) => m.id !== context.optimisticId)
          : base;
        // De-dupe in case a refetch already added these.
        const ids = new Set(withoutOptimistic.map((m) => m.id));
        const additions: ChatMessageDTO[] = [];
        if (!ids.has(data.userMessage.id)) additions.push(data.userMessage);
        if (!ids.has(data.assistantMessage.id)) {
          additions.push(data.assistantMessage);
        }
        return [...withoutOptimistic, ...additions];
      });
    },

    onSettled: () => {
      // Reconcile with the server (correct ordering/seq/highlightText).
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
