import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { shareThread, listThreadShares, revokeThreadShare } from "@/app/actions/threadShares";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread sharing", () => {
  let ownerId: string;
  let editorId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const editor = await db.user.create({ data: { email: "editor@x.com", passwordHash: "x", name: "Editor" } });
    ownerId = owner.id;
    editorId = editor.id;

    await loginAs(ownerId);
    const thread = await createThread({ name: "Primary", categoryColor: "#f2c14e" });
    threadId = thread.id;
  });
  afterAll(async () => db.$disconnect());

  it("lets the owner share a thread by email with a permission level", async () => {
    await loginAs(ownerId);
    const share = await shareThread(threadId, "editor@x.com", "EDITOR");
    expect(share.sharedWithUserId).toBe(editorId);
    expect(share.permission).toBe("EDITOR");
  });

  it("blocks a non-owner from sharing", async () => {
    await loginAs(ownerId);
    await shareThread(threadId, "editor@x.com", "EDITOR");

    await loginAs(editorId);
    await expect(shareThread(threadId, "someone-else@x.com", "VIEWER")).rejects.toThrow(PermissionError);
  });

  it("lists and revokes a share", async () => {
    await loginAs(ownerId);
    const share = await shareThread(threadId, "editor@x.com", "EDITOR");

    let shares = await listThreadShares(threadId);
    expect(shares).toHaveLength(1);

    await revokeThreadShare(share.id);
    shares = await listThreadShares(threadId);
    expect(shares).toHaveLength(0);
  });
});
