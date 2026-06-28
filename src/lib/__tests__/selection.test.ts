import { describe, expect, it } from "vitest";
import { chatWindowPos } from "@/lib/selection";

const WIN = { width: 360, height: 460 };
const VP = { width: 1280, height: 800 };
// A page roughly centered in the viewport: center at (640, 500).
const PAGE = { left: 300, top: 80, width: 680, height: 840 };

describe("chatWindowPos", () => {
  it("top-left selection → window below-right of it", () => {
    const sel = { top: 150, bottom: 180, left: 360, right: 460 }; // left+top half
    const pos = chatWindowPos(sel, PAGE, WIN, VP);
    expect(pos.x).toBe(472); // right (460) + gap (12) → to the right
    expect(pos.y).toBe(192); // bottom (180) + gap (12) → below
  });

  it("top-right selection → window below-left of it", () => {
    const sel = { top: 150, bottom: 180, left: 820, right: 920 }; // right+top half
    const pos = chatWindowPos(sel, PAGE, WIN, VP);
    expect(pos.x).toBe(448); // left (820) - gap (12) - width (360)
    expect(pos.y).toBe(192); // below
  });

  it("bottom-left selection → window above-right of it", () => {
    const sel = { top: 700, bottom: 740, left: 360, right: 460 }; // left+bottom half
    const pos = chatWindowPos(sel, PAGE, WIN, VP);
    expect(pos.x).toBe(472); // to the right
    expect(pos.y).toBe(228); // top (700) - gap (12) - height (460)
  });

  it("bottom-right selection → window above-left of it", () => {
    const sel = { top: 700, bottom: 740, left: 820, right: 920 }; // right+bottom half
    const pos = chatWindowPos(sel, PAGE, WIN, VP);
    expect(pos.x).toBe(448); // to the left
    expect(pos.y).toBe(228); // above
  });

  it("never places the top above minTop (below the PDF toolbar)", () => {
    // Bottom-half selection → window would open above it at y = 520-12-460 = 48,
    // but minTop=80 pins it just below the toolbar so the header stays reachable.
    const sel = { top: 520, bottom: 560, left: 360, right: 460 };
    const pos = chatWindowPos(sel, PAGE, WIN, VP, 80);
    expect(pos.y).toBe(80);
  });

  it("clamps so the window never leaves the viewport", () => {
    const sel = { top: 60, bottom: 90, left: 1240, right: 1278 };
    const pos = chatWindowPos(sel, PAGE, WIN, VP);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThanOrEqual(VP.width - WIN.width);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeLessThanOrEqual(VP.height - WIN.height);
  });
});
