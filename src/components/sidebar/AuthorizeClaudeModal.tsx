"use client";

import { useEffect, useId, useState } from "react";
import {
  useClaudeAuth,
  useStartClaudeLogin,
  useSubmitClaudeCode,
  useClaudeLogout,
} from "@/hooks/useClaudeAuth";
import styles from "./AuthorizeClaudeModal.module.css";

interface AuthorizeClaudeModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "idle" | "awaitingCode" | "done";

/**
 * "Authorize Claude" modal. A logged-in user signs in with their Anthropic
 * account so Claude answers using their subscription. Flow: Authorize → open
 * the returned URL → paste the code Anthropic shows → connected.
 *
 * The modal is mounted fresh each time it opens (UserMenu renders it only while
 * open), so local step state initializes clean — no reset effect needed.
 */
export function AuthorizeClaudeModal({
  open,
  onClose,
}: AuthorizeClaudeModalProps) {
  const titleId = useId();
  const descId = useId();
  const codeInputId = useId();

  const [step, setStep] = useState<Step>("idle");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const { data: status, isLoading } = useClaudeAuth();
  const startLogin = useStartClaudeLogin();
  const submitCode = useSubmitClaudeCode();
  const logout = useClaudeLogout();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // The server is the source of truth: once connected, show the connected view
  // regardless of the local step (covers fresh-open-while-already-connected and
  // the just-submitted "done" transition).
  const connected = status?.connected ?? false;
  const trimmedCode = code.trim();
  const submitDisabled = submitCode.isPending || trimmedCode.length === 0;

  function handleAuthorize() {
    if (startLogin.isPending) return;
    startLogin.mutate(undefined, {
      onSuccess: (result) => {
        setAuthUrl(result.url);
        setStep("awaitingCode");
      },
    });
  }

  function handleSubmitCode() {
    if (submitDisabled) return;
    submitCode.mutate(trimmedCode, {
      onSuccess: () => {
        setCode("");
        setStep("done");
      },
    });
  }

  function renderBody() {
    if (connected) {
      return (
        <div className={styles.connectedBlock}>
          <p className={styles.connectedStatus}>
            <span className={styles.dot} aria-hidden="true" />
            Connected — Claude is using your Anthropic account.
          </p>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? "Disconnecting…" : "Disconnect"}
          </button>
          {logout.error ? (
            <p className={styles.error} role="alert">
              {logout.error.message}
            </p>
          ) : null}
        </div>
      );
    }

    if (isLoading) {
      return <p className={styles.muted}>Checking authorization status…</p>;
    }

    if (step === "awaitingCode" && authUrl) {
      return (
        <div className={styles.flowBlock}>
          <a
            className={styles.openLink}
            href={authUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open authorization page ↗
          </a>
          <label className={styles.fieldLabel} htmlFor={codeInputId}>
            After you approve, paste the code Anthropic shows you:
          </label>
          <input
            id={codeInputId}
            className={styles.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste code here"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmitCode();
            }}
          />
          {submitCode.error ? (
            <p className={styles.error} role="alert">
              {submitCode.error.message}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSubmitCode}
              disabled={submitDisabled}
            >
              {submitCode.isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      );
    }

    // Not started (idle).
    return (
      <div className={styles.flowBlock}>
        <p id={descId} className={styles.explainer}>
          Sign in with your Anthropic account so Claude can answer using your
          subscription.
        </p>
        {startLogin.error ? (
          <p className={styles.error} role="alert">
            {startLogin.error.message}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleAuthorize}
            disabled={startLogin.isPending}
          >
            {startLogin.isPending ? "Starting…" : "Authorize Claude"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scrim} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Authorize Claude
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

        {renderBody()}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
