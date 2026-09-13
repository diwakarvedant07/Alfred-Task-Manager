import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormAlert from "@/components/ui/FormAlert";

describe("FormAlert", () => {
  it("renders its message with an alert role", () => {
    render(<FormAlert>Invalid email or password.</FormAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("uses a success icon and styling for the success variant", () => {
    render(<FormAlert variant="success">Password updated.</FormAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Password updated.");
  });
});
