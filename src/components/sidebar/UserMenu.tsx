"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClaudeAuth } from "@/hooks/useClaudeAuth";
import { signInGoogle, signInDev, signOutUser } from "@/api/auth";
import { AuthorizeClaudeModal } from "./AuthorizeClaudeModal";
import styles from "./UserMenu.module.css";

const ALLOW_DEV_LOGIN = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

function UserCircleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a6 6 0 0 1 11 0" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.42z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59z"
      />
      <path
        fill="#EA4335"
        d="M12 6.04c1.47 0 2.79.5 3.83 1.49l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.07 7.49l3.34 2.59C7.2 7.8 9.4 6.04 12 6.04z"
      />
    </svg>
  );
}

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Pinned bottom block. Logged out -> sign-in actions; logged in -> avatar +
 * identity with a logout popover. A subtle placeholder shows while loading.
 */
export function UserMenu() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { data: claudeAuth } = useClaudeAuth();
  const claudeConnected = claudeAuth?.connected ?? false;
  const [open, setOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isLoading) {
    return (
      <div className={styles.menu}>
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles.placeholderAvatar} />
          <span className={styles.placeholderLines}>
            <span className={styles.placeholderLine} />
            <span className={styles.placeholderLineShort} />
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className={styles.menu}>
        <button
          type="button"
          className={styles.signInPrimary}
          onClick={() => void signInGoogle()}
        >
          <GoogleIcon />
          <span>Log in with Google</span>
        </button>
        {ALLOW_DEV_LOGIN ? (
          <button
            type="button"
            className={styles.signInSecondary}
            onClick={() => void signInDev()}
          >
            <UserCircleIcon />
            <span>Sign in as Test User</span>
          </button>
        ) : null}
      </div>
    );
  }

  const displayName = user.name ?? user.email ?? "Account";
  const subline = user.name ? user.email : null;

  return (
    <div className={styles.menu} ref={rootRef}>
      {open ? (
        <div className={styles.popover} role="menu">
          <button
            type="button"
            className={styles.popoverItem}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAuthModalOpen(true);
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21 2-9.6 9.6" />
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m15 5 3 3" />
            </svg>
            <span>Authorize Claude</span>
            {claudeConnected ? (
              <span className={styles.keyDot} aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            className={styles.popoverItem}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOutUser();
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.account}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.avatar} src={user.image} alt="" />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {initials(user.name, user.email)}
          </span>
        )}
        <span className={styles.identity}>
          <span className={styles.name}>{displayName}</span>
          {subline ? <span className={styles.email}>{subline}</span> : null}
        </span>
        {claudeConnected ? (
          <span
            className={styles.connectedBadge}
            title="Claude account connected"
            aria-label="Claude account connected"
          />
        ) : null}
        <span className={styles.chevron} aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {authModalOpen && (
        <AuthorizeClaudeModal open onClose={() => setAuthModalOpen(false)} />
      )}
    </div>
  );
}
