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
import { useChatStore } from "@/store/chatStore";
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

/** Resize bounds. */
const MIN_W = 280;
const MIN_H = 240;

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_HANDLES: ResizeDir[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
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

  // Window UI state from the chat store.
  const win = useChatStore((s) =>
    s.windows.find((w) => w.highlightId === highlightId),
  );
  const closeWindow = useChatStore((s) => s.closeWindow);
  const minimizeWindow = useChatStore((s) => s.minimizeWindow);
  const focusWindow = useChatStore((s) => s.focusWindow);
  const moveWindow = useChatStore((s) => s.moveWindow);
  const setWindowRect = useChatStore((s) => s.setWindowRect);

  const { messages, isFetched } = useChatMessages(documentId, highlightId);
  const sendMutation = useSendChatMessage(documentId, highlightId);
  const deleteHighlight = useDeleteHighlight(documentId);

  // Closing a window that never held a conversation should also remove its
  // highlight from the PDF — an abandoned "Ask Claude" shouldn't leave a mark.
  // Only delete once the messages query has settled empty (so reopening a
  // highlight whose messages are still loading is never wrongly removed) and no
  // send is in flight.
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
  const messagesRef = useRef<HTMLDivElement>(null);

  // Drag bookkeeping: pointer-to-window offset captured on pointerdown.
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  // Resize bookkeeping: pointer + window rect captured when a handle grab starts.
  const resizeStart = useRef<{
    dir: ResizeDir;
    px: number;
    py: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Leave resize mode on Escape.
  useEffect(() => {
    if (!resizing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setResizing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [resizing]);

  // Auto-scroll to the newest message / typing indicator.
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sendMutation.isPending]);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!win) return;
      // Ignore drags that start on the header buttons.
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
    },
    [moveWindow, highlightId, win],
  );

  const onHeaderPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragOffset.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  const onResizePointerDown = useCallback(
    (dir: ResizeDir, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!win) return;
      e.stopPropagation();
      focusWindow(highlightId);
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
      if (start.dir.includes("e")) {
        w = start.w + dx;
      }
      if (start.dir.includes("s")) {
        h = start.h + dy;
      }
      if (start.dir.includes("w")) {
        w = start.w - dx;
      }
      if (start.dir.includes("n")) {
        h = start.h - dy;
      }
      // Clamp size, then keep the opposite edge anchored for n/w grabs.
      w = Math.min(Math.max(w, MIN_W), maxW);
      h = Math.min(Math.max(h, MIN_H), maxH);
      if (start.dir.includes("w")) x = start.x + (start.w - w);
      if (start.dir.includes("n")) y = start.y + (start.h - h);
      // Keep within the viewport, and never let the top go behind the toolbar.
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
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

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

  const windowStyle = useMemo<CSSProperties | null>(() => {
    if (!win) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const minTop = windowTopBoundary();
    // Keep the window within the viewport; the top never goes behind the PDF
    // toolbar so the header (resize/minimize/close) is always reachable.
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

  // No context provider, no window, or minimized → render nothing.
  if (!ctx || !win || win.minimized || !windowStyle) return null;

  const title = truncate(selectedText, 40);

  return (
    <section
      role="dialog"
      aria-label={"Chat about: " + title}
      className={[styles.window, resizing ? styles.windowResizing : ""].join(" ")}
      style={windowStyle}
      onMouseDown={() => focusWindow(highlightId)}
    >
      {resizing
        ? RESIZE_HANDLES.map((dir) => (
            <div
              key={dir}
              className={[styles.resizeHandle, styles["handle_" + dir]].join(" ")}
              onPointerDown={(e) => onResizePointerDown(dir, e)}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              aria-hidden="true"
            />
          ))
        : null}

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
          <button
            type="button"
            className={[
              styles.iconButton,
              resizing ? styles.iconButtonActive : "",
            ].join(" ")}
            aria-label="Resize chat window"
            aria-pressed={resizing}
            title="Resize"
            onClick={() => {
              focusWindow(highlightId);
              setResizing((v) => !v);
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
            onClick={handleClose}
          >
            ×
          </button>
        </div>
      </div>

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
    </section>
  );
}
