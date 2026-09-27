import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import { useLongPress } from "@/components/canvas/useLongPress";

afterEach(() => vi.useRealTimers());

const down = { button: 0, clientX: 0, clientY: 0 } as React.PointerEvent;

describe("useLongPress", () => {
  it("fires after the hold time and swallows the following click", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onPointerDown(down));
    act(() => vi.advanceTimersByTime(450));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(result.current.consumeLongPress()).toBe(true);
    expect(result.current.consumeLongPress()).toBe(false);
  });

  it("is cancelled by releasing early or moving more than 8px", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onPointerDown(down));
    act(() => result.current.handlers.onPointerUp());
    act(() => result.current.handlers.onPointerDown(down));
    act(() => result.current.handlers.onPointerMove({ clientX: 20, clientY: 0 } as React.PointerEvent));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumeLongPress()).toBe(false);
  });

  it("fires immediately on right-click and prevents the browser menu", () => {
    const onLongPress = vi.fn();
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.handlers.onContextMenu({ preventDefault } as unknown as React.MouseEvent));
    expect(preventDefault).toHaveBeenCalled();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
