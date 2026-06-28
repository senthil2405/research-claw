import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DocumentMeta } from "@/lib/types";

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

const docs: DocumentMeta[] = [
  {
    id: "doc-1",
    filename: "attention-is-all-you-need.pdf",
    sizeBytes: 1234,
    pageCount: 15,
    createdAt: new Date().toISOString(),
  },
  {
    id: "doc-2",
    filename: "transformers.pdf",
    sizeBytes: 5678,
    pageCount: 8,
    createdAt: new Date().toISOString(),
  },
];

describe("DocumentHistoryList", () => {
  beforeEach(() => {
    useDocumentsMock.mockReset();
    useAuthMock.mockReset();
  });

  it("renders document filenames when documents are present", () => {
    useDocumentsMock.mockReturnValue({ documents: docs, isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<DocumentHistoryList />);
    expect(
      screen.getByText("attention-is-all-you-need.pdf"),
    ).toBeInTheDocument();
    expect(screen.getByText("transformers.pdf")).toBeInTheDocument();
    expect(screen.getByText("Recents")).toBeInTheDocument();
  });

  it("renders the authenticated empty state", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<DocumentHistoryList />);
    expect(
      screen.getByText("No documents yet — upload a PDF"),
    ).toBeInTheDocument();
  });

  it("renders the logged-out empty state", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: false });
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<DocumentHistoryList />);
    expect(
      screen.getByText("Log in to save your history"),
    ).toBeInTheDocument();
  });

  it("renders skeletons while loading", () => {
    useDocumentsMock.mockReturnValue({ documents: [], isLoading: true });
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });

    const { container } = render(<DocumentHistoryList />);
    // No empty-state copy while loading.
    expect(
      screen.queryByText("Log in to save your history"),
    ).not.toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
  });
});
