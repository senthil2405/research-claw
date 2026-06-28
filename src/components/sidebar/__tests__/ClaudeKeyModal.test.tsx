import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ClaudeKeyStatus } from "@/lib/types";

// --- Hook mocks ---------------------------------------------------------
// Mock the data hooks so the modal is tested in isolation (no QueryClient).
const { setMutate, deleteMutate } = vi.hoisted(() => ({
  setMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

let statusData: ClaudeKeyStatus | undefined;
let statusLoading = false;
let setPending = false;
let setError: Error | null = null;
let deletePending = false;
let deleteError: Error | null = null;

vi.mock("@/hooks/useClaudeKey", () => ({
  useClaudeKey: () => ({ data: statusData, isLoading: statusLoading }),
  useSetClaudeKey: () => ({
    mutate: setMutate,
    isPending: setPending,
    error: setError,
  }),
  useDeleteClaudeKey: () => ({
    mutate: deleteMutate,
    isPending: deletePending,
    error: deleteError,
  }),
}));

// Imported AFTER mocks.
import { ClaudeKeyModal } from "../ClaudeKeyModal";

function renderModal() {
  return render(<ClaudeKeyModal open onClose={() => {}} />);
}

describe("ClaudeKeyModal", () => {
  beforeEach(() => {
    setMutate.mockReset();
    deleteMutate.mockReset();
    statusData = undefined;
    statusLoading = false;
    setPending = false;
    setError = null;
    deletePending = false;
    deleteError = null;
  });

  it("not-connected: shows the API key input and a Save button", () => {
    statusData = { connected: false, last4: null, updatedAt: null };
    renderModal();

    expect(screen.getByText("API key")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("sk-ant-..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    // No connected affordances.
    expect(screen.queryByRole("button", { name: /Remove key/ })).toBeNull();
  });

  it("typing a key + Save calls the set mutation with the trimmed key", () => {
    statusData = { connected: false, last4: null, updatedAt: null };
    renderModal();

    const input = screen.getByPlaceholderText("sk-ant-...");
    fireEvent.change(input, { target: { value: "  sk-ant-typed-key  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setMutate).toHaveBeenCalledTimes(1);
    expect(setMutate.mock.calls[0][0]).toBe("sk-ant-typed-key");
  });

  it("Save is disabled (no mutation) when the input is empty", () => {
    statusData = { connected: false, last4: null, updatedAt: null };
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setMutate).not.toHaveBeenCalled();
  });

  it("connected: shows ••••last4 and a Remove key button; Remove calls delete", () => {
    statusData = { connected: true, last4: "wxyz", updatedAt: new Date().toISOString() };
    renderModal();

    expect(screen.getByText(/••••wxyz/)).toBeInTheDocument();
    const remove = screen.getByRole("button", { name: /Remove key/ });
    fireEvent.click(remove);
    expect(deleteMutate).toHaveBeenCalledTimes(1);
  });

  it("renders a set-mutation error inline (role=alert)", () => {
    statusData = { connected: false, last4: null, updatedAt: null };
    setError = new Error("Anthropic rejected this API key.");
    renderModal();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Anthropic rejected this API key.");
  });

  it("renders a delete-mutation error inline", () => {
    statusData = { connected: true, last4: "wxyz", updatedAt: null };
    deleteError = new Error("Could not remove key.");
    renderModal();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not remove key.");
  });
});
