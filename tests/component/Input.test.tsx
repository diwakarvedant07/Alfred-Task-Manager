import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Mail } from "lucide-react";
import Input from "@/components/ui/Input";

describe("Input", () => {
  it("associates the visible label with the field and reports changes", () => {
    const onChange = vi.fn();
    render(<Input name="email" label="Email" icon={<Mail size={16} />} onChange={onChange} />);

    const input = screen.getByLabelText("Email");
    fireEvent.change(input, { target: { value: "a@example.com" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the label accessible but visually hidden when hideLabel is set", () => {
    render(<Input name="email" label="Email" hideLabel placeholder="Email" />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "Email");
  });

  it("toggles a password field between hidden and visible text", () => {
    render(<Input name="password" type="password" label="Password" />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });
});
