import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Markdown } from "@/components/viewer/Markdown";

describe("Markdown", () => {
  it("renders bold, italics, lists, and inline code", () => {
    render(
      <Markdown
        content={"**bold** and *em* and `code`\n\n- one\n- two\n- three"}
      />,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("em").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(document.querySelectorAll("li").length).toBe(3);
  });

  it("renders block LaTeX math via KaTeX", () => {
    const { container } = render(
      <Markdown
        content={"Before\n\n$$\\sigma_i(z) = \\frac{e^{z_i}}{\\sum_j e^{z_j}}$$\n\nAfter"}
      />,
    );
    // KaTeX emits .katex nodes for rendered formulas; the .mfrac confirms the
    // fraction structure was parsed (display vs inline wrapping is verified
    // visually — it varies by environment).
    expect(container.querySelector(".katex")).toBeTruthy();
    expect(container.querySelector(".mfrac")).toBeTruthy();
  });

  it("renders inline math", () => {
    const { container } = render(
      <Markdown content={"probability $\\sigma_i(z) \\in (0,1)$ here"} />,
    );
    expect(container.querySelector(".katex")).toBeTruthy();
  });

  it("renders backslash-delimited math \\(…\\) and \\[…\\] (e.g. Gemini output)", () => {
    const { container } = render(
      <Markdown
        content={
          "inline \\(W + BA\\) and block:\n\n\\[\\frac{a}{b} = c\\]\n\ndone"
        }
      />,
    );
    // Both delimiter styles normalize to $-math and reach KaTeX.
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".mfrac")).toBeTruthy();
  });

  it("does not render raw HTML (XSS safe)", () => {
    const { container } = render(
      <Markdown content={"<script>alert(1)</script> safe"} />,
    );
    expect(container.querySelector("script")).toBeNull();
  });
});
