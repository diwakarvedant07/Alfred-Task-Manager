import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Textarea from "@/components/ui/Textarea";

describe("Textarea", () => {
  it("associates the label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(<Textarea label="Description" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(<Textarea label="Description" hideLabel placeholder="Description" />);

    expect(screen.getByLabelText("Description")).toHaveAttribute("placeholder", "Description");
  });
});
