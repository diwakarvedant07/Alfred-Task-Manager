import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import { signIn } from "next-auth/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

beforeEach(() => {
  push.mockReset();
  vi.mocked(signIn).mockReset();
});

describe("LoginPage", () => {
  it("logs in and redirects to /canvas on success", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/canvas"));
  });

  it("shows an error message and does not redirect when signIn fails", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: "CredentialsSignin" } as never);
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic error and stops loading when signIn throws", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("network down"));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correcthorse123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(push).not.toHaveBeenCalled();
  });
});
