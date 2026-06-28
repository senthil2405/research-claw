"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createHighlight } from "@/api/chat";
import type { CreateHighlightInput, HighlightDTO } from "@/lib/types";

/**
 * Create-highlight mutation. mutate/mutateAsync take a CreateHighlightInput.
 * Invalidates ["highlights", documentId] on success.
 */
export function useCreateHighlight(documentId: string) {
  const queryClient = useQueryClient();

  return useMutation<HighlightDTO, Error, CreateHighlightInput>({
    mutationFn: (input: CreateHighlightInput) =>
      createHighlight(documentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["highlights", documentId],
      });
    },
  });
}
