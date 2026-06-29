"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useChatStore, DEFAULT_WINDOW_SIZE } from "@/store/chatStore";
import { useDocChatOptional } from "@/components/viewer/DocChatContext";
import { windowTopBoundary } from "@/components/viewer/placement";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useSendChatMessage } from "@/hooks/useSendChatMessage";
import { useDeleteHighlight } from "@/hooks/useDeleteHighlight";
import { Markdown } from "./Markdown";
import type { ChatMessageDTO } from "@/lib/types";
import styles from "./ChatWindow.module.css";

interface ChatWindowProps {
  highlightId: string;
  selectedText: string;
}

/** Context window size for the current model (Claude Opus 4.8 = 1 000 000). */
const CTX_WINDOW = 1_000_000;

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

/** Resize bounds. */
const MIN_W = 280;
const MIN_H = 240;
/** Pixels from right edge that trigger the snap-to-panel preview. */
const SNAP_ZONE = 80;
/** Pixels of leftward header drag that detaches a panel to floating. */
const DETACH_THRESHOLD = 60;

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_HANDLES: ResizeDir[] = [
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
];

/** Truncate to `max` chars with an ellipsis. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

export default function ChatWindow({
  highlightId,
  selectedText,
}: ChatWindowProps) {
  const ctx = useDocChatOptional();
  const documentId = ctx?.documentId ?? "";

  const win = useChatStore((s) =>
    s.windows.find((w) => w.highlightId === highlightId),
  );
  const closeWindow = useChatStore((s) => s.closeWindow);
  const minimizeWindow = useChatStore((s) => s.minimizeWindow);
  const focusWindow = useChatStore((s) => s.focusWindow);
  const moveWindow = useChatStore((s) => s.moveWindow);
  const setWindowRect = useChatStore((s) => s.setWindowRect);
  const setWindowMode = useChatStore((s) => s.setWindowMode);
  const setPanelWidth = useChatStore((s) => s.setPanelWidth);

  const { messages, isFetched } = useChatMessages(documentId, highlightId);
  const sendMutation = useSendChatMessage(documentId, highlightId);
  const deleteHighlight = useDeleteHighlight(documentId);

  const handleClose = useCallback(() => {
    if (isFetched && messages.length === 0 && !sendMutation.isPending) {
      deleteHighlight.mutate(highlightId);
    }
    closeWindow(highlightId);
  }, [
    isFetched,
    messages.length,
    sendMutation.isPending,
    deleteHighlight,
    highlightId,
    closeWindow,
  ]);

  const [draft, setDraft] = useState("");
  const [resizing, setResizing] = useState(false);
  const [edgeDragging, setEdgeDragging] = useState(false);
  const [showSnapPreview, setShowSnapPreview] = useState(false);
  const showResizeBorder = resizing || edgeDragging;
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const topZ = useChatStore((s) => s.topZ);
  const isTop = win?.z === topZ && !win?.minimized;

  // Floating drag: pointer-to-window offset captured on pointerdown.
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  // Floating resize: start state captured on handle pointerdown.
  const resizeStart = useRef<{
    dir: ResizeDir;
    px: number;
    py: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  // Panel drag: tracks initial x and whether detach already fired.
  const panelDragRef = useRef<{ px: number; detached: boolean } | null>(null);
  // Panel left-edge resize: start state.
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Auto-focus the textarea when the window first opens.
  useEffect(() => {
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc: exit resize mode first; if not resizing, close the window.
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (resizing) {
        setResizing(false);
      } else {
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isTop, resizing, handleClose]);

  // Auto-scroll to the newest message / typing indicator.
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sendMutation.isPending]);

  // ---- Floating header drag ----

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!win) return;
      if ((e.target as HTMLElement).closest("button")) return;
      focusWindow(highlightId);
      dragOffset.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [win, focusWindow, highlightId],
  );

  const onHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const offset = dragOffset.current;
      if (!offset || !win) return;
      const minTop = windowTopBoundary();
      const maxX = Math.max(0, window.innerWidth - win.width);
      const maxY = Math.max(minTop, window.innerHeight - 48);
      const x = Math.min(Math.max(0, e.clientX - offset.dx), maxX);
      const y = Math.min(Math.max(minTop, e.clientY - offset.dy), maxY);
      moveWindow(highlightId, x, y);
      setShowSnapPreview(e.clientX > window.innerWidth - SNAP_ZONE);
    },
    [moveWindow, highlightId, win],
  );

  const onHeaderPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragOffset.current = null;
      setShowSnapPreview(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (e.clientX > window.innerWidth - SNAP_ZONE) {
        setWindowMode(highlightId, "panel");
      }
    },
    [setWindowMode, highlightId],
  );

  // ---- Floating resize ----

  const onResizePointerDown = useCallback(
    (dir: ResizeDir, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!win) return;
      e.stopPropagation();
      focusWindow(highlightId);
      setEdgeDragging(true);
      resizeStart.current = {
        dir,
        px: e.clientX,
        py: e.clientY,
        x: win.x,
        y: win.y,
        w: win.width,
        h: win.height,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [win, focusWindow, highlightId],
  );

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = resizeStart.current;
      if (!start) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = Math.round(vw * 0.95);
      const maxH = Math.round(vh * 0.9);
      const dx = e.clientX - start.px;
      const dy = e.clientY - start.py;
      let { x, y, w, h } = start;
      if (start.dir.includes("e")) w = start.w + dx;
      if (start.dir.includes("s")) h = start.h + dy;
      if (start.dir.includes("w")) w = start.w - dx;
      if (start.dir.includes("n")) h = start.h - dy;
      w = Math.min(Math.max(w, MIN_W), maxW);
      h = Math.min(Math.max(h, MIN_H), maxH);
      if (start.dir.includes("w")) x = start.x + (start.w - w);
      if (start.dir.includes("n")) y = start.y + (start.h - h);
      const minTop = windowTopBoundary();
      x = Math.min(Math.max(0, x), Math.max(0, vw - w));
      y = Math.min(Math.max(minTop, y), Math.max(minTop, vh - h));
      setWindowRect(highlightId, { x, y, width: w, height: h });
    },
    [setWindowRect, highlightId],
  );

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      resizeStart.current = null;
      setEdgeDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // ---- Panel header drag-to-detach ----

  const onPanelHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      panelDragRef.current = { px: e.clientX, detached: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPanelHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panelDragRef.current || panelDragRef.current.detached) return;
      const dx = e.clientX - panelDragRef.current.px;
      if (dx < -DETACH_THRESHOLD) {
        panelDragRef.current.detached = true;
        const w = win?.width ?? DEFAULT_WINDOW_SIZE.width;
        const floatX = Math.max(0, e.clientX - w / 2);
        const floatY = Math.max(windowTopBoundary(), e.clientY - 20);
        setWindowMode(highlightId, "floating", { x: floatX, y: floatY });
        // Seed floating drag so pointermove continues seamlessly after re-render.
        dragOffset.current = { dx: w / 2, dy: 20 };
      }
    },
    [win, setWindowMode, highlightId],
  );

  const onPanelHeaderPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      panelDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // ---- Panel left-edge resize ----

  const onPanelResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!win) return;
      e.stopPropagation();
      panelResizeRef.current = { startX: e.clientX, startWidth: win.panelWidth };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [win],
  );

  const onPanelResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = panelResizeRef.current;
      if (!start) return;
      // Dragging left (smaller clientX) makes the panel wider.
      setPanelWidth(highlightId, start.startWidth + (start.startX - e.clientX));
    },
    [setPanelWidth, highlightId],
  );

  const onPanelResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      panelResizeRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // ---- Message send ----

  const handleSend = useCallback(() => {
    const question = draft.trim();
    if (!question || sendMutation.isPending) return;
    sendMutation.mutate(question);
    setDraft("");
  }, [draft, sendMutation]);

  const onTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ---- Floating window style (null in panel mode) ----

  const windowStyle = useMemo<CSSProperties | null>(() => {
    if (!win || win.mode === "panel") return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const minTop = windowTopBoundary();
    const x = Math.min(Math.max(0, win.x), Math.max(0, vw - win.width));
    const y = Math.min(Math.max(minTop, win.y), Math.max(minTop, vh - 48));
    return {
      left: x,
      top: y,
      width: win.width,
      height: win.height,
      zIndex: win.z,
    };
  }, [win]);

  // ---- Early-return guards ----

  if (!ctx || !win) return null;

  const isPanel = win.mode === "panel";

  if (!isPanel && (win.minimized || !windowStyle)) return null;

  const title = truncate(selectedText, 40);

  // ---- Shared body JSX (context chip + messages + composer) ----

  const bodyContent = (
    <>
      {selectedText ? (
        <div className={styles.context} title={selectedText}>
          {"“" + truncate(selectedText, 240) + "”"}
        </div>
      ) : null}

      <div className={styles.messages} ref={messagesRef}>
        {messages.length === 0 && !sendMutation.isPending ? (
          <p className={styles.empty}>
            Ask a question about this passage to start the conversation.
          </p>
        ) : null}

        {messages.map((msg: ChatMessageDTO) => {
          const isUser = msg.role === "user";
          const showQuote =
            isUser &&
            !!msg.highlightText &&
            msg.highlightText.trim() !== selectedText.trim();
          return (
            <div
              key={msg.id}
              className={[
                styles.row,
                isUser ? styles.rowUser : styles.rowAssistant,
              ].join(" ")}
            >
              {showQuote ? (
                <span
                  className={styles.quoteAbove}
                  title={msg.highlightText ?? undefined}
                >
                  {"“" + truncate(msg.highlightText ?? "", 60) + "”"}
                </span>
              ) : null}
              <div
                className={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAssistant,
                ].join(" ")}
              >
                {isUser ? msg.content : <Markdown content={msg.content} />}
              </div>
              {!isUser && (msg.inputTokens != null || msg.durationMs != null) ? (
                <span className={styles.tokenMeta}>
                  {msg.inputTokens != null && msg.outputTokens != null
                    ? `${fmtK(msg.inputTokens)} in · ${fmtK(msg.outputTokens)} out · ${((msg.inputTokens / CTX_WINDOW) * 100).toFixed(1)}% ctx`
                    : null}
                  {msg.inputTokens != null && msg.durationMs != null ? " · " : null}
                  {msg.durationMs != null ? fmtDuration(msg.durationMs) : null}
                </span>
              ) : null}
            </div>
          );
        })}

        {sendMutation.isPending ? (
          <div className={[styles.row, styles.rowAssistant].join(" ")}>
            <div
              className={[styles.bubble, styles.bubbleAssistant].join(" ")}
              aria-label="Assistant is typing"
            >
              <span className={styles.typing}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={draft}
          placeholder="Ask about this passage…"
          aria-label="Message"
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onTextareaKeyDown}
        />
        <button
          type="button"
          className={styles.sendButton}
          aria-label="Send message"
          disabled={sendMutation.isPending || draft.trim().length === 0}
          onClick={handleSend}
        >
          ↑
        </button>
      </div>
    </>
  );

  // ---- Panel mode ----

  if (isPanel) {
    return (
      <section
        role="dialog"
        aria-label={"Chat about: " + title}
        className={styles.windowPanel}
        style={{ width: win.panelWidth }}
      >
        <div
          className={styles.resizeHandleLeft}
          onPointerDown={onPanelResizePointerDown}
          onPointerMove={onPanelResizePointerMove}
          onPointerUp={onPanelResizePointerUp}
          onPointerCancel={onPanelResizePointerUp}
          aria-hidden="true"
        />

        <div
          className={styles.header}
          onPointerDown={onPanelHeaderPointerDown}
          onPointerMove={onPanelHeaderPointerMove}
          onPointerUp={onPanelHeaderPointerUp}
          onPointerCancel={onPanelHeaderPointerUp}
        >
          <span className={styles.title} title={selectedText}>
            {title ? "“" + title + "”" : "Chat"}
          </span>
          <div className={styles.headerButtons}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Minimize chat window"
              title="Detach to floating window"
              onClick={() => minimizeWindow(highlightId)}
            >
              –
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close chat window"
              title="Close (Esc)"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </div>

        {bodyContent}
      </section>
    );
  }

  // ---- Floating mode ----

  return (
    <>
      {showSnapPreview && (
        <div className={styles.snapPreview} aria-hidden="true" />
      )}
      <section
        role="dialog"
        aria-label={"Chat about: " + title}
        className={[
          styles.window,
          showResizeBorder ? styles.windowResizing : "",
        ].join(" ")}
        style={windowStyle!}
        onMouseDown={() => focusWindow(highlightId)}
      >
        {RESIZE_HANDLES.map((dir) => (
          <div
            key={dir}
            className={[styles.resizeHandle, styles["handle_" + dir]].join(" ")}
            onPointerDown={(e) => onResizePointerDown(dir, e)}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            aria-hidden="true"
          />
        ))}

        <div
          className={styles.header}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <span className={styles.title} title={selectedText}>
            {title ? "“" + title + "”" : "Chat"}
          </span>
          <div className={styles.headerButtons}>
            {/* Expand floating window to panel */}
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Expand to panel"
              title="Dock as panel"
              onClick={() => {
                focusWindow(highlightId);
                setWindowMode(highlightId, "panel");
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Minimize chat window"
              onClick={() => minimizeWindow(highlightId)}
            >
              –
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close chat window"
              title="Close (Esc)"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </div>

        {bodyContent}
      </section>
    </>
  );
}
