import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import { requestPasswordReset } from "@/app/actions/auth";

vi.mock("@/app/actions/auth", () => ({ requestPasswordReset: vi.fn() }));

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockReset();
});

describe("ForgotPasswordPage", () => {
  it("shows the dev-mode reset link after submitting", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ resetUrl: "/reset-password?token=abc123" });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("link", { name: "/reset-password?token=abc123" })).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith("a@example.com");
  });

  it("shows the identical link UI even for an email with no account (the response gives no indication either way)", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ resetUrl: "/reset-password?token=deadbeef" });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nobody@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("link", { name: "/reset-password?token=deadbeef" })).toBeInTheDocument();
    expect(screen.getByText(/a password reset link has been generated/)).toBeInTheDocument();
  });
});
