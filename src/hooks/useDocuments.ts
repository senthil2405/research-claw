"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchDocuments } from "@/api/documents";
import type { DocumentMeta } from "@/lib/types";

/**
 * Documents list hook backed by GET /api/documents.
 * Returns the full React Query result plus convenience fields:
 *  - documents: DocumentMeta[] (data ?? [])
 *  - isLoading: boolean
 */
export function useDocuments(): UseQueryResult<DocumentMeta[], Error> & {
  documents: DocumentMeta[];
} {
  const query = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
  });

  return {
    ...query,
    documents: query.data ?? [],
  };
}
