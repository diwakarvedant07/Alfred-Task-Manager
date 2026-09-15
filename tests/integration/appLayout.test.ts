import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import AppLayout from "@/app/(app)/layout";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe("AppLayout", () => {
  beforeEach(async () => {
    await resetDb();
    mockedAuth.mockReset();
    vi.mocked(redirect).mockReset();
  });
  afterAll(async () => db.$disconnect());

  it("redirects to /login instead of crashing when the session's user no longer exists in the database", async () => {
    // Simulates a stale JWT cookie: the session token is still validly
    // signed, but the user row it points at was deleted (e.g. a dev DB
    // reset while a browser held an old session).
    mockedAuth.mockResolvedValue({ user: { id: "deleted-user-id" } });

    await AppLayout({ children: null });

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("does not redirect when the session's user exists", async () => {
    const user = await db.user.create({
      data: { email: "shell@example.com", passwordHash: "x", name: "Shell User" },
    });
    mockedAuth.mockResolvedValue({ user: { id: user.id } });

    await AppLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });
});
