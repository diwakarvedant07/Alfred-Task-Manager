import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/resetDb";
import { PermissionError } from "@/lib/permissions";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";

import {
  createJarvisSession,
  listJarvisSessions,
  renameJarvisSession,
  deleteJarvisSession,
  listJarvisMessages,
} from "@/app/actions/jarvisSessions";

async function loginAs(userId: string) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: userId } });
}

describe("jarvisSessions actions", () => {
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "owner@x.com", passwordHash: "x", name: "Owner" } });
    const other = await db.user.create({ data: { email: "other@x.com", passwordHash: "x", name: "Other" } });
    ownerId = owner.id;
    otherId = other.id;
  });
  afterAll(async () => db.$disconnect());

  it("creates a session with a null title", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    expect(session.title).toBeNull();
    expect(session.userId).toBe(ownerId);
  });

  it("lists only the current user's sessions, most recently updated first", async () => {
    await loginAs(ownerId);
    const first = await createJarvisSession();
    const second = await createJarvisSession();
    await loginAs(otherId);
    await createJarvisSession();

    await loginAs(ownerId);
    const sessions = await listJarvisSessions();

    expect(sessions.map((s) => s.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("renames a session, and an empty title clears it back to null", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await renameJarvisSession(session.id, "Rocket Launch Prep");
    let sessions = await listJarvisSessions();
    expect(sessions.find((s) => s.id === session.id)?.title).toBe("Rocket Launch Prep");

    await renameJarvisSession(session.id, "   ");
    sessions = await listJarvisSessions();
    expect(sessions.find((s) => s.id === session.id)?.title).toBeNull();
  });

  it("a user cannot rename another user's session", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await loginAs(otherId);
    await expect(renameJarvisSession(session.id, "Sneaky")).rejects.toThrow(PermissionError);
  });

  it("deletes a session and cascades its messages", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "USER", content: "hi" } });

    await deleteJarvisSession(session.id);

    const sessions = await listJarvisSessions();
    expect(sessions).toHaveLength(0);
    const messages = await db.jarvisMessage.findMany({ where: { sessionId: session.id } });
    expect(messages).toHaveLength(0);
  });

  it("a user cannot delete another user's session", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();

    await loginAs(otherId);
    await expect(deleteJarvisSession(session.id)).rejects.toThrow(PermissionError);
  });

  it("lists a session's messages in order, with only the current user's own session readable", async () => {
    await loginAs(ownerId);
    const session = await createJarvisSession();
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "USER", content: "first" } });
    await db.jarvisMessage.create({ data: { sessionId: session.id, userId: ownerId, role: "ASSISTANT", content: "second" } });

    const messages = await listJarvisMessages(session.id);
    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);

    await loginAs(otherId);
    await expect(listJarvisMessages(session.id)).rejects.toThrow(PermissionError);
  });

  it("requires being logged in", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(createJarvisSession()).rejects.toThrow(PermissionError);
  });
});
