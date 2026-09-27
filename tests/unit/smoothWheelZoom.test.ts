import { describe, it, expect } from "vitest";
import { wheelZoomFactor, zoomAround, stepZoom } from "@/components/canvas/useSmoothWheelZoom";

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeLessThan(1);
  });

  it("boosts pinch gestures (ctrl+wheel) on every OS, not just macOS", () => {
    const pinch = wheelZoomFactor({ deltaY: -5, deltaMode: 0, ctrlKey: true });
    const scroll = wheelZoomFactor({ deltaY: -5, deltaMode: 0, ctrlKey: false });
    expect(pinch).toBeGreaterThan(1.05);
    expect(pinch).toBeGreaterThan(scroll);
  });

  it("gives a mouse-wheel notch a clearly visible step", () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(1.2);
  });
});

describe("zoomAround", () => {
  it("keeps the flow point under the anchor fixed on screen", () => {
    const vp = { x: 100, y: 50, zoom: 1 };
    const anchor = { x: 300, y: 250 };
    const next = zoomAround(vp, anchor, 2);
    const before = { x: (anchor.x - vp.x) / vp.zoom, y: (anchor.y - vp.y) / vp.zoom };
    const after = { x: (anchor.x - next.x) / next.zoom, y: (anchor.y - next.y) / next.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(2);
  });
});

describe("stepZoom", () => {
  it("eases toward the target and snaps when close", () => {
    const next = stepZoom(1, 2);
    expect(next).toBeGreaterThan(1);
    expect(next).toBeLessThan(2);
    expect(stepZoom(1.9999, 2)).toBe(2);
  });
});
