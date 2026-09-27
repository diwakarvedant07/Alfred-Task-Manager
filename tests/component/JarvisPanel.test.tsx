import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JarvisPanel from "@/components/jarvis/JarvisPanel";

describe("JarvisPanel", () => {
  it("renders a trigger button and calls onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<JarvisPanel onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Jarvis" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("forwards buttonRef to the launcher button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<JarvisPanel onOpen={() => {}} buttonRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Jarvis" }));
  });
});
