import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useViewerStore } from "@/store/viewerStore";
import {
  DocChatContext,
  type DocChatContextValue,
} from "@/components/viewer/DocChatContext";
import PdfToolbar from "@/components/viewer/PdfToolbar";
import type { HighlightDTO } from "@/lib/types";

// PdfToolbar creates an <a> for download and spawns an <iframe> for print —
// neither is relevant here, so silence the JSDOM "not implemented" warnings.
vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "#"), revokeObjectURL: vi.fn() });

function makeHighlight(id: string): HighlightDTO {
  return {
    id,
    documentId: "doc1",
    pageNumber: 1,
    rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.03 }],
    selectedText: "some passage",
    createdAt: new Date().toISOString(),
  };
}

function makeCtx(highlights: HighlightDTO[] = []): DocChatContextValue {
  return {
    documentId: "doc1",
    highlights,
    startChatFromSelection: vi.fn(),
    startChatNoSelection: vi.fn(),
    openWindow: vi.fn(),
  };
}

function renderToolbar(highlights: HighlightDTO[] = []) {
  return render(
    <DocChatContext.Provider value={makeCtx(highlights)}>
      <PdfToolbar src="/api/documents/doc1/file" filename="test.pdf" />
    </DocChatContext.Provider>,
  );
}

describe("PdfToolbar — chat count badge", () => {
  beforeEach(() => {
    // Give the toolbar a loaded document so controls are enabled.
    useViewerStore.setState({ numPages: 5, currentPage: 1 });
  });

  afterEach(() => {
    useViewerStore.getState().reset();
  });

  it("shows no badge when there are no chats", () => {
    renderToolbar([]);
    expect(screen.queryByLabelText(/chats/i)).not.toBeInTheDocument();
  });

  it("shows badge with count 1 when there is one chat", () => {
    renderToolbar([makeHighlight("h1")]);
    const badge = screen.getByLabelText("1 chats");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  it("shows badge with correct count for multiple chats", () => {
    renderToolbar(["h1", "h2", "h3"].map(makeHighlight));
    const badge = screen.getByLabelText("3 chats");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps the badge display at 99+ for 100 or more chats", () => {
    const highlights = Array.from({ length: 100 }, (_, i) =>
      makeHighlight(`h${i}`),
    );
    renderToolbar(highlights);
    const badge = screen.getByLabelText("100 chats");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("99+");
  });

  it("updates the badge when highlights change", () => {
    const { rerender } = renderToolbar([makeHighlight("h1")]);
    expect(screen.getByLabelText("1 chats")).toBeInTheDocument();

    rerender(
      <DocChatContext.Provider
        value={makeCtx(["h1", "h2"].map(makeHighlight))}
      >
        <PdfToolbar src="/api/documents/doc1/file" filename="test.pdf" />
      </DocChatContext.Provider>,
    );
    expect(screen.getByLabelText("2 chats")).toBeInTheDocument();
  });
});
