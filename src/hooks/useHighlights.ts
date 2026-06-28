"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchHighlights } from "@/api/chat";
import type { HighlightDTO } from "@/lib/types";

/**
 * Highlights ("windows") for a document, backed by GET /highlights.
 * Returns the full React Query result plus `highlights` (data ?? []).
 */
export function useHighlights(
  documentId: string,
): UseQueryResult<HighlightDTO[], Error> & { highlights: HighlightDTO[] } {
  const query = useQuery({
    queryKey: ["highlights", documentId],
    queryFn: () => fetchHighlights(documentId),
  });

  return {
    ...query,
    highlights: query.data ?? [],
  };
}
