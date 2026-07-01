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

  it("openWindow honors an explicit position (stored, used when floating)", () => {
    store().openWindow("h1", { x: 300, y: 400 });
    expect(store().windows[0]).toMatchObject({ x: 300, y: 400 });
  });

  it("openWindow defaults to panel mode", () => {
    store().openWindow("h1");
    expect(store().windows[0].mode).toBe("panel");
    // Panel width is computed from window.innerWidth (jsdom default: 1024).
    expect(store().windows[0].panelWidth).toBe(Math.round(1024 / 3));
  });

  it("openWindow replaces an existing panel window with the new one", () => {
    store().openWindow("h1");
    expect(store().windows[0].mode).toBe("panel");
    store().openWindow("h2");
    // h1 is removed; h2 takes its place as the sole panel window.
    expect(store().windows).toHaveLength(1);
    expect(store().windows.find((w) => w.highlightId === "h1")).toBeUndefined();
    expect(store().windows.find((w) => w.highlightId === "h2")?.mode).toBe("panel");
  });

  it("openWindow on an existing id focuses + un-minimizes it instead of duplicating", () => {
    store().openWindow("h1");
    // Convert to floating and minimize to test un-minimize behavior.
    store().setWindowMode("h1", "floating");
    store().minimizeWindow("h1");
    expect(store().windows[0].minimized).toBe(true);
    const zBefore = store().windows[0].z;

    store().openWindow("h1");
    expect(store().windows).toHaveLength(1); // no duplicate
    expect(store().windows[0].minimized).toBe(false); // un-minimized
    expect(store().windows[0].z).toBeGreaterThan(zBefore); // raised
  });

  it("focusWindow raises z above the current top", () => {
    // Open h1 as panel, convert to floating so we can have two windows at once.
    store().openWindow("h1");
    store().setWindowMode("h1", "floating");
    store().openWindow("h2");
    const topBefore = store().topZ;
    store().focusWindow("h1");
    const h1 = store().windows.find((w) => w.highlightId === "h1")!;
    expect(h1.z).toBe(topBefore + 1);
    expect(h1.z).toBeGreaterThan(
      store().windows.find((w) => w.highlightId === "h2")!.z,
    );
  });

  it("minimizeWindow on panel converts it to floating (not hidden)", () => {
    store().openWindow("h1");
    expect(store().windows[0].mode).toBe("panel");
    store().minimizeWindow("h1");
    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].mode).toBe("floating");
    expect(store().windows[0].minimized).toBe(false);
  });

  it("minimizeWindow on floating sets minimized true without removing the window", () => {
    store().openWindow("h1");
    store().setWindowMode("h1", "floating");
    store().minimizeWindow("h1");
    expect(store().windows).toHaveLength(1);
    expect(store().windows[0].minimized).toBe(true);
  });

  it("closeWindow removes only the targeted window", () => {
    store().openWindow("h1");
    store().setWindowMode("h1", "floating");
    store().openWindow("h2");
    store().closeWindow("h1");
    expect(store().windows.map((w) => w.highlightId)).toEqual(["h2"]);
  });

  it("moveWindow updates position of the targeted window only", () => {
    // Open h1 as panel, convert to floating so we can have two windows at once.
    store().openWindow("h1", { x: 0, y: 0 });
    store().setWindowMode("h1", "floating");
    store().openWindow("h2", { x: 0, y: 0 });
    store().moveWindow("h1", 500, 600);
    expect(store().windows.find((w) => w.highlightId === "h1")).toMatchObject({
      x: 500,
      y: 600,
    });
    // h2 unchanged.
    expect(store().windows.find((w) => w.highlightId === "h2")).toMatchObject({
      x: 0,
      y: 0,
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
