import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserMenu from "@/components/shell/UserMenu";
import { updateThemePreference } from "@/app/actions/theme";
import { updatePreferredAiModel } from "@/app/actions/aiModel";
import { signOut } from "next-auth/react";

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

beforeEach(() => {
  vi.mocked(updateThemePreference).mockReset();
  vi.mocked(updatePreferredAiModel).mockReset();
  vi.mocked(signOut).mockReset();
});

describe("UserMenu", () => {
  it("shows the user's name and email once opened", () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("calls updateThemePreference and applies the accent color immediately when the color picker changes", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff5fa8" } });

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("DARK", "#ff5fa8"));
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff5fa8");
  });

  it("calls updateThemePreference with the toggled mode when the theme toggle is clicked", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(updateThemePreference).toHaveBeenCalledWith("LIGHT", "#38e0ff"));
  });

  it("calls updatePreferredAiModel when the model picker changes", async () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gemini-3.1-pro-preview" } });

    await waitFor(() => expect(updatePreferredAiModel).toHaveBeenCalledWith("gemini-3.1-pro-preview"));
  });

  it("calls signOut with a redirect to /login when Log out is clicked", () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
