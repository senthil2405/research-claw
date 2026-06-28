"use client";

import { useEffect, useId, useState } from "react";
import {
  useClaudeKey,
  useSetClaudeKey,
  useDeleteClaudeKey,
} from "@/hooks/useClaudeKey";
import styles from "./ClaudeKeyModal.module.css";

interface ClaudeKeyModalProps {
  open: boolean;
  onClose: () => void;
}

const CONSOLE_KEYS_URL = "https://console.anthropic.com/account/keys";

/**
 * "Connect Claude" modal. Lets a logged-in user paste their Anthropic API key
 * (stored server-side, never displayed in full) so chat is billed to them.
 */
export function ClaudeKeyModal({ open, onClose }: ClaudeKeyModalProps) {
  const titleId = useId();
  const descId = useId();
  const [keyInput, setKeyInput] = useState("");

  const { data: status, isLoading } = useClaudeKey();
  const setKey = useSetClaudeKey();
  const deleteKey = useDeleteClaudeKey();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // The modal is mounted fresh each time it opens (UserMenu renders it only
  // while open), so transient state initializes clean — no reset effect needed.
  if (!open) return null;

  const connected = status?.connected ?? false;
  const trimmed = keyInput.trim();
  const saveDisabled = setKey.isPending || trimmed.length === 0;
  const errorMessage = setKey.error?.message ?? deleteKey.error?.message ?? null;

  function handleSave() {
    if (saveDisabled) return;
    setKey.mutate(trimmed, {
      onSuccess: () => setKeyInput(""),
    });
  }

  return (
    <div
      className={styles.scrim}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Connect Claude
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <p id={descId} className={styles.explainer}>
          Paste your Anthropic API key to use real Claude, billed to your
          Anthropic account. Get one at{" "}
          <a
            className={styles.link}
            href={CONSOLE_KEYS_URL}
            target="_blank"
            rel="noreferrer"
          >
            console.anthropic.com/account/keys
          </a>
          .
        </p>

        {connected ? (
          <div className={styles.connectedRow}>
            <span className={styles.connectedStatus}>
              <span className={styles.dot} aria-hidden="true" />
              Connected · ••••{status?.last4 ?? ""}
            </span>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => deleteKey.mutate()}
              disabled={deleteKey.isPending}
            >
              {deleteKey.isPending ? "Removing…" : "Remove key"}
            </button>
          </div>
        ) : isLoading ? (
          <p className={styles.muted}>Checking key status…</p>
        ) : null}

        <label className={styles.fieldLabel} htmlFor={`${titleId}-input`}>
          {connected ? "Replace key" : "API key"}
        </label>
        <input
          id={`${titleId}-input`}
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {setKey.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
