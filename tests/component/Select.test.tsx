import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Select from "@/components/ui/Select";

describe("Select", () => {
  it("associates the label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(
      <Select label="Permission" value="VIEWER" onChange={onChange}>
        <option value="VIEWER">Viewer</option>
        <option value="EDITOR">Editor</option>
      </Select>
    );

    fireEvent.change(screen.getByLabelText("Permission"), { target: { value: "EDITOR" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(
      <Select label="Permission" hideLabel>
        <option value="VIEWER">Viewer</option>
      </Select>
    );

    expect(screen.getByLabelText("Permission")).toBeInTheDocument();
  });
});
