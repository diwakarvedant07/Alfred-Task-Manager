import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOpenThreads } from "@/components/canvas/useOpenThreads";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useOpenThreads", () => {
  it("opens, closes and tracks recency", () => {
    const { result } = renderHook(() => useOpenThreads("u1"));
    act(() => result.current.open("a"));
    act(() => result.current.open("b"));
    act(() => result.current.open("a"));
    expect(result.current.openIds).toEqual(["b", "a"]);
    expect(result.current.isOpen("b")).toBe(true);

    act(() => result.current.closeMostRecent());
    expect(result.current.openIds).toEqual(["b"]);

    act(() => result.current.close("b"));
    expect(result.current.openIds).toEqual([]);
  });

  it("persists per user and restores on remount", async () => {
    const first = renderHook(() => useOpenThreads("u1"));
    act(() => first.result.current.open("a"));
    first.unmount();

    const second = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(second.result.current.openIds).toEqual(["a"]));

    const other = renderHook(() => useOpenThreads("u2"));
    await waitFor(() => expect(other.result.current.openIds).toEqual([]));
  });

  it("falls back to all-closed when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(result.current.openIds).toEqual([]));
    act(() => result.current.open("a"));
    expect(result.current.openIds).toEqual(["a"]);
  });

  it("ignores malformed stored data", async () => {
    window.localStorage.setItem("arc.openThreads.u1", '{"not":"an array"}');
    const { result } = renderHook(() => useOpenThreads("u1"));
    await waitFor(() => expect(result.current.openIds).toEqual([]));
  });
});
