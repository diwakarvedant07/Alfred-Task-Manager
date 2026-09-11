import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "@/components/settings/ThemeToggle";

describe("ThemeToggle", () => {
  it("toggles between LIGHT and DARK on click", () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="DARK" onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith("LIGHT");
  });
});
