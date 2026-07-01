import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocChatContext, type DocChatContextValue } from "@/components/viewer/DocChatContext";
import SelectionToolbar from "@/components/viewer/SelectionToolbar";
import { useChatStore, type ActiveSelection } from "@/store/chatStore";

const SEL: ActiveSelection = {
  pageNumber: 1,
  rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.03 }],
  selectedText: "selected words",
  anchor: { x: 120, y: 80 },
  bounds: { top: 80, bottom: 96, left: 100, right: 140 },
  pageBounds: { left: 0, top: 0, width: 800, height: 1000 },
};

function renderWithProvider(value: DocChatContextValue) {
  return render(
    <DocChatContext.Provider value={value}>
      <SelectionToolbar />
    </DocChatContext.Provider>,
  );
}

function makeCtx(over: Partial<DocChatContextValue> = {}): DocChatContextValue {
  return {
    documentId: "doc1",
    filename: "test.pdf",
    highlights: [],
    startChatFromSelection: vi.fn(),
    startChatNoSelection: vi.fn(),
    openWindow: vi.fn(),
    ...over,
  };
}

describe("SelectionToolbar", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders nothing when there is no active selection", () => {
    renderWithProvider(makeCtx());
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders the toolbar + chat button when a selection is active", () => {
    useChatStore.getState().setSelection(SEL);
    renderWithProvider(makeCtx());
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ask Claude about this" }),
    ).toBeInTheDocument();
  });

  it("positions the toolbar below-right for left-half selections", () => {
    // SEL center x = 120 < page center 400 → left half → button to the right.
    useChatStore.getState().setSelection(SEL);
    renderWithProvider(makeCtx());
    const toolbar = screen.getByRole("toolbar");
    // left = bounds.right(140) + PAD(4); top = bounds.bottom(96) + PAD(4).
    expect(toolbar.style.left).toBe("144px");
    expect(toolbar.style.top).toBe("100px");
  });

  it("positions the toolbar below-left for right-half selections", () => {
    useChatStore.getState().setSelection({
      ...SEL,
      bounds: { top: 80, bottom: 96, left: 600, right: 700 }, // center 650 > 400
    });
    renderWithProvider(makeCtx());
    const toolbar = screen.getByRole("toolbar");
    // left = bounds.left(600) - PAD(4); top = bounds.bottom(96) + PAD(4).
    expect(toolbar.style.left).toBe("596px");
    expect(toolbar.style.top).toBe("100px");
    // Below + left side → shift left by own width, no vertical shift.
    expect(toolbar.style.transform).toBe("translate(-100%, 0)");
  });

  it("flips the toolbar above when the selection is near the viewport bottom", () => {
    // jsdom viewport height is 768; a selection bottom at 760 leaves no room
    // for the pill below, so it should flip above the selection's top.
    useChatStore.getState().setSelection({
      ...SEL,
      bounds: { top: 740, bottom: 760, left: 100, right: 140 }, // left half
    });
    renderWithProvider(makeCtx());
    const toolbar = screen.getByRole("toolbar");
    // top = bounds.top(740) - PAD(4); shift up by own height.
    expect(toolbar.style.top).toBe("736px");
    expect(toolbar.style.transform).toBe("translate(0, -100%)");
  });

  it("calls startChatFromSelection when the chat button is clicked", () => {
    const startChatFromSelection = vi.fn();
    useChatStore.getState().setSelection(SEL);
    renderWithProvider(makeCtx({ startChatFromSelection }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Claude about this" }));
    expect(startChatFromSelection).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when no DocChat provider is mounted", () => {
    useChatStore.getState().setSelection(SEL);
    render(<SelectionToolbar />);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
