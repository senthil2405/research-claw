"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteHighlight } from "@/api/chat";

/**
 * Delete-highlight mutation. mutate/mutateAsync take a highlightId (string).
 * Invalidates ["highlights", documentId] and ["messages", documentId] on success.
 */
export function useDeleteHighlight(documentId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (highlightId: string) =>
      deleteHighlight(documentId, highlightId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["highlights", documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["messages", documentId],
      });
    },
  });
}
