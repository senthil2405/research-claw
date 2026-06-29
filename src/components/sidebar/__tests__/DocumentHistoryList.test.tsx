import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DocumentMeta } from "@/lib/types";
import { getDateBucket, groupDocsByDate } from "../DocumentHistoryList";

const useDocumentsMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: () => useDocumentsMock(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/hooks/useDeleteDocument", () => ({
  useDeleteDocument: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));

import { DocumentHistoryList } from "../DocumentHistoryList";

function makeDoc(id: string, filename: string, daysAgo = 0): DocumentMeta {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { id, filename, sizeBytes: 1000, pageCount: 5, title: null, createdAt: d.toISOString() };
}

const docs: DocumentMeta[] = [
  makeDoc("doc-1", "attention-is-all-you-need.pdf"),
  makeDoc("doc-2", "transformers.pdf"),
];

// ---- Pure grouping helpers ----

describe("getDateBucket", () => {
  it("returns Today for a date from right now", () => {
    expect(getDateBucket(new Date().toISOString())).toBe("Today");
  });

  it("returns Yesterday for exactly 1 day ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(getDateBucket(d.toISOString())).toBe("Yesterday");
  });

  it("returns This week for 2–6 days ago", () => {
    for (const n of [2, 3, 6]) {
      const d = new Date();
      d.setDate(d.getDate() - n);
      expect(getDateBucket(d.toISOString())).toBe("This week");
    }
  });

  it("returns This month for 7–29 days ago", () => {
    for (const n of [7, 15, 29]) {
      const d = new Date();
      d.setDate(d.getDate() - n);
      expect(getDateBucket(d.toISOString())).toBe("This month");
    }
  });

  it("returns Older for 30+ days ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    expect(getDateBucket(d.toISOString())).toBe("Older");
  });
});

describe("groupDocsByDate", () => {
  it("returns a single Today group when all docs are from today", () => {
    const groups = groupDocsByDate(docs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].docs).toHaveLength(2);
  });

  it("omits empty buckets", () => {
    const groups = groupDocsByDate([makeDoc("d1", "a.pdf", 0)]);
    const labels = groups.map((g) => g.label);
    expect(labels).not.toContain("Yesterday");
    expect(labels).not.toContain("Older");
  });

  it("orders groups newest-first (Today before Older)", () => {
    const mixed = [
      makeDoc("d1", "today.pdf", 0),
      makeDoc("d2", "old.pdf", 60),
    ];
    const groups = groupDocsByDate(mixed);
    expect(groups[0].label).toBe("Today");
    expect(groups[1].label).toBe("Older");
  });

  it("returns an empty array for no documents", () => {
    expect(groupDocsByDate([])).toHaveLength(0);
  });
});

// ---- Component rendering ----

describe("DocumentHistoryList", () => {
  beforeEach(() => {
    useDocumentsMock.mockReset();
    useAuthMock.mockReset();
  });

  it("renders document filenames under a date group label", () => {
    useDocumentsMock.mockReturnValue({ documents: docs, isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<DocumentHistoryList />);
    expect(screen.getByText("attention-is-all-you-need.pdf")).toBeInTheDocument();
    expect(screen.getByText("transformers.pdf")).toBeInTheDocument();
    // Both docs are from today so exactly one group label should appear.
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("renders multiple group labels when docs span different periods", () => {
    const mixed = [
      makeDoc("d1", "new.pdf", 0),
      makeDoc("d2", "old.pdf", 60),
    ];
    useDocumentsMock.mockReturnValue({ documents: mixed, isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<DocumentHistoryList />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Older")).toBeInTheDocument();
  });

  it("renders the authenticated empty state", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<DocumentHistoryList />);
    expect(screen.getByText("No documents yet — upload a PDF")).toBeInTheDocument();
  });

  it("renders the logged-out empty state", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<DocumentHistoryList />);
    expect(screen.getByText("Log in to save your history")).toBeInTheDocument();
  });

  it("renders skeletons while loading", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: true });
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });

    const { container } = render(<DocumentHistoryList />);
    expect(screen.queryByText("Log in to save your history")).not.toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
  });
});
