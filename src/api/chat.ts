// Highlight + chat data access. Thin wrappers over the JSON fetch helpers.

import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import type {
  ChatMessageDTO,
  CreateHighlightInput,
  HighlightDTO,
  SendMessageResponse,
} from "@/lib/types";

/** List all highlights ("windows") for a document. */
export async function fetchHighlights(
  documentId: string,
): Promise<HighlightDTO[]> {
  return apiGet<{ highlights: HighlightDTO[] }>(
    "/api/documents/" + documentId + "/highlights",
  ).then((r) => r.highlights);
}

/** Create a highlight (window) from a selection. */
export async function createHighlight(
  documentId: string,
  input: CreateHighlightInput,
): Promise<HighlightDTO> {
  return apiPost<HighlightDTO>(
    "/api/documents/" + documentId + "/highlights",
    input,
  );
}

/** Delete a highlight (window) and its thread. */
export async function deleteHighlight(
  documentId: string,
  highlightId: string,
): Promise<void> {
  return apiDelete(
    "/api/documents/" + documentId + "/highlights/" + highlightId,
  );
}

/** Fetch the chat messages for one window. */
export async function fetchMessages(
  documentId: string,
  highlightId: string,
): Promise<ChatMessageDTO[]> {
  const query = "?highlightId=" + encodeURIComponent(highlightId);
  return apiGet<{ messages: ChatMessageDTO[] }>(
    "/api/documents/" + documentId + "/messages" + query,
  ).then((r) => r.messages);
}

/** Send a question in a window; returns the persisted user + assistant messages. */
export async function sendChatMessage(
  documentId: string,
  highlightId: string,
  question: string,
): Promise<SendMessageResponse> {
  return apiPost<SendMessageResponse>("/api/documents/" + documentId + "/chat", {
    highlightId,
    question,
  });
}
