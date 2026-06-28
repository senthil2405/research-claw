"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDocument } from "@/api/documents";

/**
 * Delete-mutation hook. mutate/mutateAsync take a document id (string).
 * Invalidates the ["documents"] query on success.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
