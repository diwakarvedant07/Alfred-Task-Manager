import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import ModelPicker from "@/components/settings/ModelPicker";

describe("ModelPicker", () => {
  it("calls onChange with the new value when a preset is selected", () => {
    const onChange = vi.fn();
    render(<ModelPicker value="gemini-2.5-pro" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-2.5-flash" } });
    expect(onChange).toHaveBeenCalledWith("gemini-2.5-flash");
  });

  it("shows a pre-filled custom text input when value is not one of the presets", () => {
    const onChange = vi.fn();
    render(<ModelPicker value="gemini-3.0-experimental" onChange={onChange} />);

    const select = screen.getByLabelText("AI model") as HTMLSelectElement;
    expect(select.value).toBe("custom");
    const input = screen.getByLabelText("Custom model ID") as HTMLInputElement;
    expect(input.value).toBe("gemini-3.0-experimental");

    fireEvent.change(input, { target: { value: "gemini-3.1-experimental" } });
    expect(onChange).toHaveBeenCalledWith("gemini-3.1-experimental");
  });

  it("switching the select to Custom shows an empty input and reports an empty value", () => {
    const Wrapper = () => {
      const [value, setValue] = useState("gemini-2.5-pro");
      return <ModelPicker value={value} onChange={setValue} />;
    };
    render(<Wrapper />);

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Custom model ID")).toBeInTheDocument();
  });
});
