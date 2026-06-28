import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore, type ActiveSelection } from "@/store/chatStore";

const store = () => useChatStore.getState();

const SEL: ActiveSelection = {
  pageNumber: 2,
  rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
  selectedText: "hello world",
  anchor: { x: 50, y: 60 },
  bounds: { top: 60, bottom: 78, left: 40, right: 90 },
  pageBounds: { left: 0, top: 0, width: 800, height: 1000 },
};

describe("chatStore", () => {
  beforeEach(() => {
    store().reset();
  });

  it("starts from documented defaults", () => {
    const s = store();
    expect(s.activeSelection).toBeNull();
    expect(s.windows).toEqual([]);
    expect(s.hoveredHighlightId).toBeNull();
    expect(s.topZ).toBe(1);
  });

  it("setSelection sets and clears the active selection", () => {
    store().setSelection(SEL);
    expect(store().activeSelection).toEqual(SEL);
    store().setSelection(null);
    expect(store().activeSelection).toBeNull();
  });

  it("openWindow adds a window at the default position and raises z", () => {
    store().openWindow("h1");
    const w = store().windows;
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ highlightId: "h1", minimized: false });
    expect(w[0].z).toBe(2); // topZ started at 1, bumped to 2
    expect(store().topZ).toBe(2);
  });

  it("openWindow honors an explicit position", () => {
    store().openWindow("h1", { x: 300, y: 400 });
    expect(store().windows[0]).toMatchObject({ x: 300, y: 400 });
  });

  it("cascades new windows by 28px per existing window", () => {
    store().openWindow("h1", { x: 100, y: 100 });
    store().openWindow("h2", { x: 100, y: 100 });
    store().openWindow("h3", { x: 100, y: 100 });
    const [a, b, c] = store().windows;
    expect(a).toMatchObject({ x: 100, y: 100 }); // offset 0
    expect(b).toMatchObject({ x: 128, y: 128 }); // offset 28
    expect(c).toMatchObject({ x: 156, y: 156 }); // offset 56
  });

  it("openWindow on an existing id focuses + un-minimizes it instead of duplicating", () => {
    store().openWindow("h1");
    store().minimizeWindow("h1");
    expect(store().windows[0].minimized).toBe(true);
    const zBefore = store().windows[0].z;

    store().openWindow("h1");
    expect(store().windows).toHaveLength(1); // no duplicate
    expect(store().windows[0].minimized).toBe(false); // un-minimized
    expect(store().windows[0].z).toBeGreaterThan(zBefore); // raised
  });

  it("focusWindow raises z above the current top", () => {
    store().openWindow("h1");
    store().openWindow("h2");
    const topBefore = store().topZ;
    store().focusWindow("h1");
    const h1 = store().windows.find((w) => w.highlightId === "h1")!;
    expect(h1.z).toBe(topBefore + 1);
    expect(h1.z).toBeGreaterThan(
      store().windows.find((w) => w.highlightId === "h2")!.z,
    );
  });

  it("minimizeWindow sets minimized true without removing the window", () => {
    store().openWindow("h1");
    store().minimizeWindow("h1");
    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].minimized).toBe(true);
  });

  it("closeWindow removes only the targeted window", () => {
    store().openWindow("h1");
    store().openWindow("h2");
    store().closeWindow("h1");
    expect(store().windows.map((w) => w.highlightId)).toEqual(["h2"]);
  });

  it("moveWindow updates position of the targeted window only", () => {
    store().openWindow("h1", { x: 0, y: 0 });
    store().openWindow("h2", { x: 0, y: 0 });
    store().moveWindow("h1", 500, 600);
    expect(store().windows.find((w) => w.highlightId === "h1")).toMatchObject({
      x: 500,
      y: 600,
    });
    // h2 unchanged (apart from its own cascade offset of 28).
    expect(store().windows.find((w) => w.highlightId === "h2")).toMatchObject({
      x: 28,
      y: 28,
    });
  });

  it("setHovered toggles the hovered id", () => {
    store().setHovered("h9");
    expect(store().hoveredHighlightId).toBe("h9");
    store().setHovered(null);
    expect(store().hoveredHighlightId).toBeNull();
  });

  it("reset clears everything back to defaults", () => {
    store().setSelection(SEL);
    store().openWindow("h1");
    store().setHovered("h1");
    store().reset();
    const s = store();
    expect(s.activeSelection).toBeNull();
    expect(s.windows).toEqual([]);
    expect(s.hoveredHighlightId).toBeNull();
    expect(s.topZ).toBe(1);
  });

  it("opens windows with a default size", () => {
    store().openWindow("h1");
    const w = store().windows[0];
    expect(w.width).toBe(360);
    expect(w.height).toBe(460);
  });

  it("setWindowRect merges geometry (resize)", () => {
    store().openWindow("h1");
    store().setWindowRect("h1", { width: 520, height: 600 });
    let w = store().windows[0];
    expect(w.width).toBe(520);
    expect(w.height).toBe(600);
    store().setWindowRect("h1", { x: 5, y: 7, width: 300, height: 300 });
    w = store().windows[0];
    expect(w).toMatchObject({ x: 5, y: 7, width: 300, height: 300 });
  });
});
