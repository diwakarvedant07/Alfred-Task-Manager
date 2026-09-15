import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, unmount } from "@testing-library/react";
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

  it("renders identical UI regardless of whether the email has an account (no observable difference)", async () => {
    vi.mocked(requestPasswordReset).mockImplementation(async (email: string) =>
      email === "exists@example.com"
        ? { resetUrl: "/reset-password?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
        : { resetUrl: "/reset-password?token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
    );

    const { container: containerWithAccount, unmount: unmountFirst } = render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "exists@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(/a password reset link has been generated/);
    const htmlWithAccount = containerWithAccount.innerHTML.replace(/token=[0-9a-f]+/g, "token=TOKEN");
    unmountFirst();

    const { container: containerWithoutAccount } = render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(/a password reset link has been generated/);
    const htmlWithoutAccount = containerWithoutAccount.innerHTML.replace(/token=[0-9a-f]+/g, "token=TOKEN");

    expect(htmlWithAccount).toBe(htmlWithoutAccount);
  });
});
