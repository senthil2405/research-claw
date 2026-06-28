import { describe, expect, it } from "vitest";
import { clientRectsToNormRects, normRectsToStyle } from "@/lib/selection";

/** Build a rect-like object accepted by clientRectsToNormRects. */
function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height } as DOMRect;
}

const PAGE = { left: 100, top: 200, width: 400, height: 800 };

describe("clientRectsToNormRects", () => {
  it("normalizes a rect to 0..1 of the page box", () => {
    // A rect at (200,400) size 100x200 inside a 400x800 page offset (100,200).
    const out = clientRectsToNormRects([rect(200, 400, 100, 200)], PAGE);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBeCloseTo((200 - 100) / 400, 6); // 0.25
    expect(out[0].y).toBeCloseTo((400 - 200) / 800, 6); // 0.25
    expect(out[0].w).toBeCloseTo(100 / 400, 6); // 0.25
    expect(out[0].h).toBeCloseTo(200 / 800, 6); // 0.25
  });

  it("clamps coordinates that extend beyond the page edges to [0,1]", () => {
    // Starts left/above the page and extends well past the right/bottom edge.
    const out = clientRectsToNormRects(
      [rect(50, 100, 1000, 2000)],
      PAGE,
    );
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(0);
    expect(out[0].y).toBe(0);
    // Far edges clamp to 1, so derived w/h fill the page.
    expect(out[0].w).toBe(1);
    expect(out[0].h).toBe(1);
  });

  it("drops zero-area and negative-size rects", () => {
    const out = clientRectsToNormRects(
      [
        rect(200, 400, 0, 50), // zero width
        rect(200, 400, 50, 0), // zero height
        rect(200, 400, -5, 50), // negative width
        rect(200, 400, 50, 50), // keeper
      ],
      PAGE,
    );
    expect(out).toHaveLength(1);
  });

  it("drops a rect that lies entirely outside the page (clamps to zero area)", () => {
    // Entirely to the left of the page: both x and right clamp to 0 → w=0 → dropped.
    const out = clientRectsToNormRects([rect(0, 400, 50, 50)], PAGE);
    expect(out).toHaveLength(0);
  });

  it("returns [] when the page box has no area", () => {
    expect(
      clientRectsToNormRects([rect(200, 400, 50, 50)], {
        left: 0,
        top: 0,
        width: 0,
        height: 100,
      }),
    ).toEqual([]);
  });

  it("accepts a DOMRectList-like (indexable with .length)", () => {
    const list = {
      0: rect(200, 400, 100, 200),
      length: 1,
    } as unknown as DOMRectList;
    const out = clientRectsToNormRects(list, PAGE);
    expect(out).toHaveLength(1);
  });
});

describe("normRectsToStyle", () => {
  it("inverts a normalized rect back to pixel offsets", () => {
    const px = normRectsToStyle({ x: 0.25, y: 0.5, w: 0.25, h: 0.1 }, 400, 800);
    expect(px).toEqual({ left: 100, top: 400, width: 100, height: 80 });
  });

  it("round-trips with clientRectsToNormRects", () => {
    const [norm] = clientRectsToNormRects([rect(200, 400, 100, 200)], PAGE);
    const px = normRectsToStyle(norm, PAGE.width, PAGE.height);
    expect(px.left).toBeCloseTo(100, 6);
    expect(px.top).toBeCloseTo(200, 6);
    expect(px.width).toBeCloseTo(100, 6);
    expect(px.height).toBeCloseTo(200, 6);
  });
});
