"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { uploadDocument } from "@/api/documents";
import type { DocumentMeta } from "@/lib/types";

/**
 * Upload-mutation hook. Tracks upload progress (0–100) in local state and
 * invalidates the ["documents"] query on success so the list refreshes.
 *
 * Returns:
 *  - the full useMutation result (mutate/mutateAsync take a File)
 *  - progress: number (0–100, reset to 0 at the start of each upload)
 *  - reset(): clears progress back to 0
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation<DocumentMeta, Error, File>({
    mutationFn: (file: File) => {
      setProgress(0);
      return uploadDocument(file, (pct) => setProgress(pct));
    },
    onSuccess: () => {
      setProgress(100);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const reset = useCallback(() => {
    setProgress(0);
    mutation.reset();
  }, [mutation]);

  return { ...mutation, progress, reset };
}
