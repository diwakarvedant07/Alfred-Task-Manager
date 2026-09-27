import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { createThread } from "@/app/actions/threads";
import { saveThreadPosition } from "@/app/actions/threadPositions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("thread positions", () => {
  let ownerId: string;
  let viewerId: string;
  let strangerId: string;
  let threadId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = (await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } })).id;
    viewerId = (await db.user.create({ data: { email: "viewer@x.com", passwordHash: "x", name: "Viewer" } })).id;
    strangerId = (await db.user.create({ data: { email: "stranger@x.com", passwordHash: "x", name: "S" } })).id;
    await loginAs(ownerId);
    threadId = (await createThread({ name: "Launch", categoryColor: "#7f77dd" })).id;
    await db.threadShare.create({ data: { threadId, sharedWithUserId: viewerId, permission: "VIEWER" } });
  });
  afterAll(async () => db.$disconnect());

  it("stores positions per user and upserts on repeat saves", async () => {
    await loginAs(ownerId);
    await saveThreadPosition(threadId, 1, 1);
    await saveThreadPosition(threadId, 10, 20);
    await loginAs(viewerId);
    await saveThreadPosition(threadId, 500, 600);

    const owner = await db.threadPosition.findMany({ where: { userId: ownerId } });
    const viewer = await db.threadPosition.findMany({ where: { userId: viewerId } });
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ positionX: 10, positionY: 20 });
    expect(viewer[0]).toMatchObject({ positionX: 500, positionY: 600 });
  });

  it("rejects a user with no access to the thread", async () => {
    await loginAs(strangerId);
    await expect(saveThreadPosition(threadId, 1, 1)).rejects.toThrow();
  });

  it("is removed when the thread is hard-deleted", async () => {
    await loginAs(ownerId);
    await saveThreadPosition(threadId, 1, 1);
    await db.threadShare.deleteMany({ where: { threadId } });
    await db.thread.delete({ where: { id: threadId } });
    expect(await db.threadPosition.count()).toBe(0);
  });
});
