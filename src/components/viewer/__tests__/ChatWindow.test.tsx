import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useChatStore } from "@/store/chatStore";
import type { ChatMessageDTO } from "@/lib/types";

// --- Mocks --------------------------------------------------------------
// Capture the send + delete mutations so we can assert they're called.
const { mockMutate, mockDeleteMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockDeleteMutate: vi.fn(),
}));

let mockMessages: ChatMessageDTO[] = [];

vi.mock("@/components/viewer/DocChatContext", () => ({
  useDocChatOptional: () => ({
    documentId: "doc1",
    highlights: [],
    startChatFromSelection: vi.fn(),
    openWindow: vi.fn(),
  }),
}));

vi.mock("@/hooks/useChatMessages", () => ({
  useChatMessages: () => ({ messages: mockMessages, isFetched: true }),
}));

vi.mock("@/hooks/useSendChatMessage", () => ({
  useSendChatMessage: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/useDeleteHighlight", () => ({
  useDeleteHighlight: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

// Imported AFTER the mocks are declared.
import ChatWindow from "@/components/viewer/ChatWindow";

const HID = "hl-1";
const SELECTED = "the important passage to discuss";

function msg(partial: Partial<ChatMessageDTO> & { id: string }): ChatMessageDTO {
  return {
    highlightId: HID,
    role: "user",
    content: "",
    highlightText: null,
    turnIndex: 0,
    seq: 0,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function renderWindow() {
  return render(<ChatWindow highlightId={HID} selectedText={SELECTED} />);
}

describe("ChatWindow", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockDeleteMutate.mockReset();
    mockMessages = [];
    useChatStore.getState().reset();
    useChatStore.getState().openWindow(HID, { x: 100, y: 100 });
  });

  it("renders the dialog with the quoted context passage", () => {
    renderWindow();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // The context chip quotes the selected passage.
    expect(screen.getAllByText(/the important passage to discuss/).length).toBeGreaterThan(0);
  });

  it("renders user and assistant message bubbles", () => {
    mockMessages = [
      msg({ id: "m0", role: "user", content: "What does this mean?", turnIndex: 0, seq: 0 }),
      msg({ id: "m1", role: "assistant", content: "**Mock Claude** here is the answer.", turnIndex: 1, seq: 1 }),
    ];
    renderWindow();
    expect(screen.getByText("What does this mean?")).toBeInTheDocument();
    // Assistant **bold** is rendered as <strong>Mock Claude</strong>.
    expect(screen.getByText("Mock Claude")).toBeInTheDocument();
    expect(screen.getByText(/here is the answer\./)).toBeInTheDocument();
  });

  it("shows the empty-state prompt when there are no messages", () => {
    renderWindow();
    expect(
      screen.getByText(/Select any piece of text/i),
    ).toBeInTheDocument();
  });

  it("sends the composer text on Enter and clears the draft", () => {
    renderWindow();
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "explain the gradient" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith("explain the gradient");
    expect(textarea.value).toBe("");
  });

  it("does not send on Shift+Enter (newline, not submit)", () => {
    renderWindow();
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "multi" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("sends via the send button", () => {
    renderWindow();
    const textarea = screen.getByLabelText("Message");
    fireEvent.change(textarea, { target: { value: "via button" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(mockMutate).toHaveBeenCalledWith("via button");
  });

  it("sends empty draft when selected text exists and no prior messages", () => {
    // canSendEmpty = true: passage present, no messages yet.
    renderWindow();
    const textarea = screen.getByLabelText("Message");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockMutate).toHaveBeenCalledWith("");
  });

  it("does not send an empty/whitespace draft when prior messages exist", () => {
    mockMessages = [msg({ id: "m1", role: "user", content: "prior question" })];
    renderWindow();
    const textarea = screen.getByLabelText("Message");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("minimize on panel window converts it to floating (store-driven)", () => {
    // openWindow now defaults to panel mode.
    expect(useChatStore.getState().windows.find((w) => w.highlightId === HID)?.mode).toBe("panel");
    renderWindow();
    fireEvent.click(screen.getByLabelText("Minimize chat window"));
    const win = useChatStore.getState().windows.find((w) => w.highlightId === HID);
    expect(win?.mode).toBe("floating");
    expect(win?.minimized).toBe(false);
  });

  it("minimize on floating window hides it (store-driven)", () => {
    // Convert to floating first so minimize → hidden.
    useChatStore.getState().setWindowMode(HID, "floating");
    renderWindow();
    fireEvent.click(screen.getByLabelText("Minimize chat window"));
    expect(
      useChatStore.getState().windows.find((w) => w.highlightId === HID)
        ?.minimized,
    ).toBe(true);
    // Minimized window renders nothing.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("close removes the window from the store", () => {
    renderWindow();
    fireEvent.click(screen.getByLabelText("Close chat window"));
    expect(
      useChatStore.getState().windows.find((w) => w.highlightId === HID),
    ).toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closing with no messages also deletes the highlight", () => {
    mockMessages = [];
    renderWindow();
    fireEvent.click(screen.getByLabelText("Close chat window"));
    expect(mockDeleteMutate).toHaveBeenCalledWith(HID);
  });

  it("closing a conversation that has messages keeps the highlight", () => {
    mockMessages = [msg({ id: "m1", role: "user", content: "hi" })];
    renderWindow();
    fireEvent.click(screen.getByLabelText("Close chat window"));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
