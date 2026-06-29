import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DocumentMeta } from "@/lib/types";

vi.mock("@/hooks/useDeleteDocument", () => ({
  useDeleteDocument: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));

import { DocumentHistoryItem } from "../DocumentHistoryItem";

function makeDoc(overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: "doc-1",
    filename: "2002.09437v2.pdf",
    sizeBytes: 3_600_000,
    pageCount: 15,
    title: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DocumentHistoryItem", () => {
  it("renders the filename", () => {
    render(<DocumentHistoryItem doc={makeDoc()} />);
    expect(screen.getByText("2002.09437v2.pdf")).toBeInTheDocument();
  });

  it("renders the title line when a title is present", () => {
    render(
      <DocumentHistoryItem
        doc={makeDoc({ title: "Attention Is All You Need" })}
      />,
    );
    expect(screen.getByText("Attention Is All You Need")).toBeInTheDocument();
  });

  it("omits the title line when title is null", () => {
    render(<DocumentHistoryItem doc={makeDoc({ title: null })} />);
    // Only the filename and meta should be present — no extra title element.
    expect(screen.queryByText("Attention Is All You Need")).not.toBeInTheDocument();
    expect(screen.getByText("2002.09437v2.pdf")).toBeInTheDocument();
  });

  it("renders page count in the meta line", () => {
    render(<DocumentHistoryItem doc={makeDoc({ pageCount: 11 })} />);
    expect(screen.getByText(/11 pp/)).toBeInTheDocument();
  });
});
