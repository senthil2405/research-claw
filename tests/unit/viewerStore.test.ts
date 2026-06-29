import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "@/store/viewerStore";

const reset = () => useViewerStore.getState().reset();

describe("viewerStore", () => {
  beforeEach(() => {
    reset();
    // reset() restores DEFAULTS but leaves scrollRequest null; ensure a clean slate
    useViewerStore.setState({ scale: 1, rotation: 0, fitMode: "width" });
  });

  it("starts from documented defaults", () => {
    const s = useViewerStore.getState();
    expect(s.numPages).toBe(0);
    expect(s.currentPage).toBe(1);
    expect(s.scale).toBe(1);
    expect(s.rotation).toBe(0);
    expect(s.fitMode).toBe("width");
    expect(s.thumbsOpen).toBe(false);
    expect(s.scrollRequest).toBeNull();
  });

  it("zoomIn increases scale and switches fitMode to 'custom'", () => {
    useViewerStore.getState().zoomIn();
    const s = useViewerStore.getState();
    expect(s.scale).toBeCloseTo(1.1, 5);
    expect(s.fitMode).toBe("custom");
  });

  it("zoomIn clamps to the maximum of 5", () => {
    const { zoomIn } = useViewerStore.getState();
    for (let i = 0; i < 100; i++) zoomIn();
    expect(useViewerStore.getState().scale).toBe(5);
  });

  it("zoomOut clamps to the minimum of 0.25", () => {
    const { zoomOut } = useViewerStore.getState();
    for (let i = 0; i < 100; i++) zoomOut();
    expect(useViewerStore.getState().scale).toBe(0.25);
  });

  it("setScale clamps into [0.25, 5] and sets fitMode 'custom'", () => {
    useViewerStore.getState().setScale(99);
    expect(useViewerStore.getState().scale).toBe(5);
    useViewerStore.getState().setScale(-3);
    expect(useViewerStore.getState().scale).toBe(0.25);
    useViewerStore.getState().setScale(2);
    expect(useViewerStore.getState().scale).toBe(2);
    expect(useViewerStore.getState().fitMode).toBe("custom");
  });

  it("rotateCw cycles 0 -> 90 -> 180 -> 270 -> 0", () => {
    const { rotateCw } = useViewerStore.getState();
    rotateCw();
    expect(useViewerStore.getState().rotation).toBe(90);
    rotateCw();
    expect(useViewerStore.getState().rotation).toBe(180);
    rotateCw();
    expect(useViewerStore.getState().rotation).toBe(270);
    rotateCw();
    expect(useViewerStore.getState().rotation).toBe(0);
  });

  it("requestScroll bumps the nonce on each call; consumeScroll clears it", () => {
    const { requestScroll, consumeScroll } = useViewerStore.getState();
    requestScroll(3);
    const first = useViewerStore.getState().scrollRequest;
    expect(first).toEqual({ page: 3, nonce: 1 });

    requestScroll(3);
    const second = useViewerStore.getState().scrollRequest;
    expect(second).toEqual({ page: 3, nonce: 2 });
    expect(second!.nonce).toBeGreaterThan(first!.nonce);

    consumeScroll();
    expect(useViewerStore.getState().scrollRequest).toBeNull();
  });

  it("reset restores every value to its default", () => {
    const s = useViewerStore.getState();
    s.setNumPages(10);
    s.setCurrentPage(4);
    s.setScale(3);
    s.rotateCw();
    s.toggleThumbs();
    s.requestScroll(2);

    s.reset();
    const after = useViewerStore.getState();
    expect(after.numPages).toBe(0);
    expect(after.currentPage).toBe(1);
    expect(after.scale).toBe(0.8);
    expect(after.rotation).toBe(0);
    expect(after.fitMode).toBe("custom");
    expect(after.thumbsOpen).toBe(false);
    expect(after.scrollRequest).toBeNull();
  });
});
