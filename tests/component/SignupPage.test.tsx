import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupPage from "@/app/(auth)/signup/page";
import { signIn } from "next-auth/react";
import { signup } from "@/app/actions/auth";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ signup: vi.fn() }));

beforeEach(() => {
  push.mockReset();
  vi.mocked(signIn).mockReset();
  vi.mocked(signup).mockReset();
});

describe("SignupPage", () => {
  it("signs up, signs in, and redirects to /canvas on success", async () => {
    vi.mocked(signup).mockResolvedValue({ id: "u1", email: "a@example.com" });
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/canvas"));
  });

  it("shows an error message when signup rejects", async () => {
    vi.mocked(signup).mockRejectedValue(new Error("An account with this email already exists."));
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists."
    );
    expect(push).not.toHaveBeenCalled();
  });
});
