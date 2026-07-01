// Highlight + chat data access. Thin wrappers over the JSON fetch helpers.

import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import type {
  ChatMessageDTO,
  ChatStreamEvent,
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

/**
 * Send a question and stream the reply via SSE, yielding delta/done/error
 * events as they arrive from the server.
 */
export async function* streamChatMessage(
  documentId: string,
  highlightId: string,
  question: string,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(
    "/api/documents/" + documentId + "/chat/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlightId, question }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("Stream request failed: " + response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (json) yield JSON.parse(json) as ChatStreamEvent;
    }
  }
}
