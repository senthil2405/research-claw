"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMessages } from "@/api/chat";
import type { ChatMessageDTO } from "@/lib/types";

/**
 * Chat messages for one window (highlight), backed by GET /messages.
 * Disabled until highlightId is truthy. Returns the full React Query result
 * plus `messages` (data ?? []).
 */
export function useChatMessages(
  documentId: string,
  highlightId: string,
): UseQueryResult<ChatMessageDTO[], Error> & { messages: ChatMessageDTO[] } {
  const query = useQuery({
    queryKey: ["messages", documentId, highlightId],
    queryFn: () => fetchMessages(documentId, highlightId),
    enabled: !!highlightId,
  });

  return {
    ...query,
    messages: query.data ?? [],
  };
}
