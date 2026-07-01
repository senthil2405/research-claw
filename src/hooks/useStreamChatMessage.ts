"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamChatMessage } from "@/api/chat";
import type { ChatMessageDTO } from "@/lib/types";

const OPTIMISTIC_PREFIX = "optimistic-";

/**
 * Base reveal speed of the typewriter, in characters per second. The CLI emits
 * text in multi-word chunks; revealing them verbatim looks like paste-jumps, so
 * we buffer received text and unveil it smoothly at roughly reading pace.
 */
const BASE_CPS = 90;
/**
 * Cap on how far behind live the typewriter is allowed to fall. If the backlog
 * would take longer than this to drain at BASE_CPS, we speed up proportionally
 * so a fast/bursty stream still finishes promptly instead of crawling. Kept
 * generous so the calm BASE_CPS pace holds for typical replies and only very
 * long backlogs nudge the speed up.
 */
const MAX_LAG_SEC = 4;

/**
 * Streaming send-message hook. Mirrors useSendChatMessage's optimistic-update
 * behavior but reads an SSE token stream and reveals the reply character by
 * character (via `streamingText`) for a smooth flow, independent of the chunk
 * sizes the server happens to send.
 */
export function useStreamChatMessage(documentId: string, highlightId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["messages", documentId, highlightId] as const,
    [documentId, highlightId],
  );

  const [isPending, setIsPending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);

  // Guards against double-submit; set synchronously in mutate before any await.
  const activeRef = useRef(false);
  // Typewriter state (refs so the rAF loop reads the latest without re-binding).
  const targetRef = useRef(""); // full text received so far
  const shownRef = useRef(0); // chars currently revealed
  const doneRef = useRef<{
    userMessage: ChatMessageDTO;
    assistantMessage: ChatMessageDTO;
  } | null>(null);
  const abortedRef = useRef(false);
  const previousRef = useRef<ChatMessageDTO[] | undefined>(undefined);
  const optimisticIdRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const finalizedRef = useRef(false);
  // Holds the latest tick fn so the rAF loop can reschedule itself without a
  // self-referential dependency.
  const tickRef = useRef<(ts: number) => void>(() => {});

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    activeRef.current = false;
    setIsPending(false);
    setStreamingText(null);
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const tick = useCallback(
    (ts: number) => {
      if (finalizedRef.current) return;

      // Error/abort: roll back the optimistic bubble and stop.
      if (abortedRef.current) {
        finalizedRef.current = true;
        queryClient.setQueryData<ChatMessageDTO[]>(queryKey, previousRef.current);
        cleanup();
        return;
      }

      const dt = Math.max(0, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const target = targetRef.current;
      const backlog = target.length - shownRef.current;
      if (backlog > 0) {
        const rate = Math.max(BASE_CPS, backlog / MAX_LAG_SEC);
        const step = Math.max(1, Math.round(rate * dt));
        shownRef.current = Math.min(target.length, shownRef.current + step);
        setStreamingText(target.slice(0, shownRef.current));
      }

      // Finished only once the server said "done" AND we've revealed everything.
      if (doneRef.current && shownRef.current >= target.length) {
        finalizedRef.current = true;
        const done = doneRef.current;
        queryClient.setQueryData<ChatMessageDTO[]>(queryKey, (current) => {
          const base = (current ?? []).filter(
            (m) => m.id !== optimisticIdRef.current,
          );
          const ids = new Set(base.map((m) => m.id));
          const additions: ChatMessageDTO[] = [];
          if (!ids.has(done.userMessage.id)) additions.push(done.userMessage);
          if (!ids.has(done.assistantMessage.id)) {
            additions.push(done.assistantMessage);
          }
          return [...base, ...additions];
        });
        cleanup();
        return;
      }

      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
    },
    [cleanup, queryClient, queryKey],
  );
  // Keep the loop's self-reschedule pointing at the latest tick.
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const run = useCallback(
    async (question: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ChatMessageDTO[]>(queryKey);
      const existing = previous ?? [];
      const last = existing[existing.length - 1];
      const optimisticId = OPTIMISTIC_PREFIX + Date.now();

      previousRef.current = previous;
      optimisticIdRef.current = optimisticId;

      // Optimistic user bubble (keeps the composer feeling instant, and keeps
      // messages.length > 0 so an in-flight window isn't treated as empty).
      queryClient.setQueryData<ChatMessageDTO[]>(queryKey, [
        ...existing,
        {
          id: optimisticId,
          highlightId,
          role: "user",
          content: question,
          highlightText: null,
          turnIndex: (last?.turnIndex ?? -1) + 1,
          seq: (last?.seq ?? -1) + 1,
          inputTokens: null,
          outputTokens: null,
          durationMs: null,
          createdAt: new Date().toISOString(),
        },
      ]);

      // Kick off the typewriter loop.
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));

      try {
        for await (const event of streamChatMessage(documentId, highlightId, question)) {
          if (event.type === "delta") {
            targetRef.current += event.text;
          } else if (event.type === "done") {
            // Authoritative full text — guarantees the typewriter reveals the
            // complete reply even if a delta was ever dropped.
            targetRef.current = event.assistantMessage.content;
            doneRef.current = {
              userMessage: event.userMessage,
              assistantMessage: event.assistantMessage,
            };
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
        // Stream closed without a done event → treat as abort.
        if (!doneRef.current) abortedRef.current = true;
      } catch {
        abortedRef.current = true;
      }
    },
    [documentId, highlightId, queryClient, queryKey],
  );

  const mutate = useCallback(
    (question: string) => {
      if (activeRef.current) return;
      activeRef.current = true;
      // Reset per-run state.
      targetRef.current = "";
      shownRef.current = 0;
      doneRef.current = null;
      abortedRef.current = false;
      finalizedRef.current = false;
      setIsPending(true);
      setStreamingText("");
      void run(question);
    },
    [run],
  );

  return { mutate, isPending, streamingText };
}
