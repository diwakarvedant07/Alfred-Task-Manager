import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Home from "@/app/page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(redirect).mockReset();
  mockedAuth.mockReset();
});

describe("Home (root page)", () => {
  it("redirects to /canvas when a session exists (valid JWT cookie)", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });

    await Home();

    expect(redirect).toHaveBeenCalledWith("/canvas");
  });

  it("redirects to /login when there is no session", async () => {
    mockedAuth.mockResolvedValue(null);

    await Home();

    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
