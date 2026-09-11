import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AccentColorPicker from "@/components/settings/AccentColorPicker";

describe("AccentColorPicker", () => {
  it("shows the current color and reports any chosen hex value on change", () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value="#38e0ff" onChange={onChange} />);

    const input = screen.getByLabelText("Accent color") as HTMLInputElement;
    expect(input.value).toBe("#38e0ff");

    fireEvent.change(input, { target: { value: "#ff5fa8" } });
    expect(onChange).toHaveBeenCalledWith("#ff5fa8");
  });
});
