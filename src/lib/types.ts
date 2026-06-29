// Shared types used across the frontend and API. These are the contracts that
// every Wave 1–3 subagent must conform to.

/** The authenticated user shape returned by GET /api/me. */
export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Response of GET /api/me */
export interface MeResponse {
  user: AuthUser | null;
}

/** Document metadata as returned by the documents API (never exposes storedName/paths). */
export interface DocumentMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number | null;
  title: string | null;
  createdAt: string; // ISO 8601
}

/** Response of GET /api/documents */
export interface DocumentListResponse {
  documents: DocumentMeta[];
}

/** Generic API error body. */
export interface ApiError {
  error: string;
}

// ---- Part B: highlights + chat ----

/** A normalized rectangle (0..1 of page width/height), zoom/rotation-stable. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A highlight = a "window": a selected region of the PDF that anchors a chat. */
export interface HighlightDTO {
  id: string;
  documentId: string;
  pageNumber: number;
  rects: NormRect[];
  selectedText: string;
  createdAt: string;
}

/** A single chat message belonging to a window (highlight). */
export interface ChatMessageDTO {
  id: string;
  highlightId: string; // the window this message belongs to
  role: "user" | "assistant";
  content: string;
  highlightText: string | null; // selected text shown above a user question
  turnIndex: number; // order within the window
  seq: number; // global order within the document's session
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  createdAt: string;
}

/** Request body to create a highlight (window). */
export interface CreateHighlightInput {
  pageNumber: number;
  rects: NormRect[];
  selectedText: string;
}

/** Response of sending a chat message: both persisted messages. */
export interface SendMessageResponse {
  userMessage: ChatMessageDTO;
  assistantMessage: ChatMessageDTO;
}

// ---- Part C: BYOK Anthropic API key ----

/** Non-sensitive status of a user's stored Anthropic API key. */
export interface ClaudeKeyStatus {
  connected: boolean;
  last4: string | null;
  updatedAt: string | null;
}

/** Whether the user has authorized their Claude account (`claude auth login`). */
export interface ClaudeAuthStatus {
  connected: boolean;
  authorizedAt: string | null;
}

/** Response of starting the login flow: the URL the user must open. */
export interface ClaudeLoginStart {
  url: string;
}
