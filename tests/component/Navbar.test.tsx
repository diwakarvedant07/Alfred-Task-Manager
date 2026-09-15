import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Navbar from "@/components/shell/Navbar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/theme", () => ({ updateThemePreference: vi.fn() }));
vi.mock("@/app/actions/aiModel", () => ({ updatePreferredAiModel: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const defaultProps = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  themeMode: "DARK" as const,
  accentColor: "#38e0ff",
  preferredAiModel: "gemini-3.8-flash",
};

describe("Navbar", () => {
  it("renders the app name and a user menu trigger", () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText("Arc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
  });
});
