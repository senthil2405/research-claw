import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DropzonePdf } from "../DropzonePdf";

function dropEvent(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
      types: ["Files"],
    },
  };
}

describe("DropzonePdf", () => {
  it("renders the idle copy", () => {
    render(<DropzonePdf onAccepted={() => {}} />);
    expect(
      screen.getByText("Drag a PDF here, or click to upload"),
    ).toBeInTheDocument();
    expect(screen.getByText("PDF up to 25 MB")).toBeInTheDocument();
  });

  it("fires onAccepted with the dropped PDF file", async () => {
    const onAccepted = vi.fn();
    const { container } = render(<DropzonePdf onAccepted={onAccepted} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const root = input.parentElement as HTMLElement;

    const pdf = new File(["%PDF-1.7 data"], "paper.pdf", {
      type: "application/pdf",
    });
    fireEvent.drop(root, dropEvent([pdf]));

    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(onAccepted.mock.calls[0][0]).toBe(pdf);
  });

  it("shows a rejection error and does NOT call onAccepted for a non-PDF", async () => {
    const onAccepted = vi.fn();
    const { container } = render(<DropzonePdf onAccepted={onAccepted} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const root = input.parentElement as HTMLElement;

    const txt = new File(["just text"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(root, dropEvent([txt]));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/isn.t a PDF/i),
    );
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
