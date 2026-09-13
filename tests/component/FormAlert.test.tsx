import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormAlert from "@/components/ui/FormAlert";

describe("FormAlert", () => {
  it("renders its message with an alert role, using error styling by default", () => {
    render(<FormAlert>Invalid email or password.</FormAlert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password.");
    expect(alert.className).toContain("border-red-500/30");
  });

  it("uses success styling for the success variant", () => {
    render(<FormAlert variant="success">Password updated.</FormAlert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Password updated.");
    expect(alert.className).toContain("border-emerald-500/30");
    expect(alert.className).not.toContain("border-red-500/30");
  });
});
