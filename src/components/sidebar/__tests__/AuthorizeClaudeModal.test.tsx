import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ClaudeAuthStatus, ClaudeLoginStart } from "@/lib/types";

// --- Hook mocks ---------------------------------------------------------
// Mock the data hooks so the modal is tested in isolation (no QueryClient and
// no real `claude auth login`).
const { startMutate, submitMutate, logoutMutate } = vi.hoisted(() => ({
  startMutate: vi.fn(),
  submitMutate: vi.fn(),
  logoutMutate: vi.fn(),
}));

let statusData: ClaudeAuthStatus | undefined;
let statusLoading = false;
let startPending = false;
let startError: Error | null = null;
let submitPending = false;
let submitError: Error | null = null;
let logoutPending = false;
let logoutError: Error | null = null;

vi.mock("@/hooks/useClaudeAuth", () => ({
  useClaudeAuth: () => ({ data: statusData, isLoading: statusLoading }),
  useStartClaudeLogin: () => ({
    mutate: startMutate,
    isPending: startPending,
    error: startError,
  }),
  useSubmitClaudeCode: () => ({
    mutate: submitMutate,
    isPending: submitPending,
    error: submitError,
  }),
  useClaudeLogout: () => ({
    mutate: logoutMutate,
    isPending: logoutPending,
    error: logoutError,
  }),
}));

// Imported AFTER mocks.
import { AuthorizeClaudeModal } from "../AuthorizeClaudeModal";

function renderModal() {
  return render(<AuthorizeClaudeModal open onClose={() => {}} />);
}

describe("AuthorizeClaudeModal", () => {
  beforeEach(() => {
    startMutate.mockReset();
    submitMutate.mockReset();
    logoutMutate.mockReset();
    statusData = { connected: false, authorizedAt: null };
    statusLoading = false;
    startPending = false;
    startError = null;
    submitPending = false;
    submitError = null;
    logoutPending = false;
    logoutError = null;
  });

  it("not connected: shows the Authorize Claude action", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: "Authorize Claude" }),
    ).toBeInTheDocument();
  });

  it("clicking Authorize starts login and, on success, reveals the URL link + code input", () => {
    // start.mutate(undefined, { onSuccess }) -> invoke onSuccess with a url.
    startMutate.mockImplementation(
      (
        _vars: undefined,
        opts?: { onSuccess?: (r: ClaudeLoginStart) => void },
      ) => {
        opts?.onSuccess?.({ url: "https://claude.com/cai/oauth/test" });
      },
    );

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Authorize Claude" }));

    expect(startMutate).toHaveBeenCalledTimes(1);
    // The open-page link points at the returned URL.
    const link = screen.getByRole("link", { name: /Open authorization page/i });
    expect(link).toHaveAttribute(
      "href",
      "https://claude.com/cai/oauth/test",
    );
    // The code input now appears.
    expect(screen.getByPlaceholderText("Paste code here")).toBeInTheDocument();
  });

  it("submitting a code calls the submit mutation with the trimmed code", () => {
    startMutate.mockImplementation(
      (
        _vars: undefined,
        opts?: { onSuccess?: (r: ClaudeLoginStart) => void },
      ) => {
        opts?.onSuccess?.({ url: "https://claude.com/cai/oauth/test" });
      },
    );

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Authorize Claude" }));

    const input = screen.getByPlaceholderText("Paste code here");
    fireEvent.change(input, { target: { value: "  the-code  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(submitMutate).toHaveBeenCalledTimes(1);
    expect(submitMutate.mock.calls[0][0]).toBe("the-code");
  });

  it("renders an inline error when the code submission fails", () => {
    startError = null;
    submitError = new Error("That code was rejected.");
    statusData = { connected: false, authorizedAt: null };

    // Render directly in the awaiting-code state by triggering start first.
    startMutate.mockImplementation(
      (
        _vars: undefined,
        opts?: { onSuccess?: (r: ClaudeLoginStart) => void },
      ) => {
        opts?.onSuccess?.({ url: "https://claude.com/cai/oauth/test" });
      },
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Authorize Claude" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That code was rejected.");
  });

  it("connected: shows Disconnect and calls logout", () => {
    statusData = { connected: true, authorizedAt: new Date().toISOString() };
    renderModal();

    const disconnect = screen.getByRole("button", { name: "Disconnect" });
    expect(disconnect).toBeInTheDocument();
    fireEvent.click(disconnect);
    expect(logoutMutate).toHaveBeenCalledTimes(1);
  });
});
