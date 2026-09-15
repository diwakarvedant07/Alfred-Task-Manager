import { describe, it, expect, vi, beforeEach } from "vitest";
import { Suspense, act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import { resetPassword } from "@/app/actions/auth";

vi.mock("@/app/actions/auth", () => ({ resetPassword: vi.fn() }));

async function renderPage(token: string | undefined) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ResetPasswordPage searchParams={Promise.resolve({ token })} />
      </Suspense>
    );
  });
}

beforeEach(() => {
  vi.mocked(resetPassword).mockReset();
});

describe("ResetPasswordPage", () => {
  it("resets the password and shows a success view", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    await renderPage("abc123");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith("abc123", "newpassword123"));
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows an error and does not call resetPassword when the passwords don't match", async () => {
    await renderPage("abc123");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's error message when the token is invalid or expired", async () => {
    vi.mocked(resetPassword).mockRejectedValue(new Error("This reset link is invalid or has expired."));
    await renderPage("bad-token");

    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link is invalid or has expired.");
  });
});
