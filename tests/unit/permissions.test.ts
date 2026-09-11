import { describe, it, expect } from "vitest";
import {
  resolveThreadRole,
  canViewThread,
  canManageThreadMeta,
  canCloseOrDeleteThread,
  canManageTasks,
  canComment,
  canManageShares,
} from "@/lib/permissions";

const OWNER_ID = "owner-1";
const EDITOR_ID = "editor-1";
const VIEWER_ID = "viewer-1";
const STRANGER_ID = "stranger-1";

const shares = [
  { sharedWithUserId: EDITOR_ID, permission: "EDITOR" as const },
  { sharedWithUserId: VIEWER_ID, permission: "VIEWER" as const },
];

describe("resolveThreadRole", () => {
  it("resolves OWNER, EDITOR, VIEWER, and null for a stranger", () => {
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: OWNER_ID })).toBe("OWNER");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: EDITOR_ID })).toBe("EDITOR");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: VIEWER_ID })).toBe("VIEWER");
    expect(resolveThreadRole({ ownerId: OWNER_ID, shares, userId: STRANGER_ID })).toBeNull();
  });
});

describe("capability matrix", () => {
  const roles: ("OWNER" | "EDITOR" | "VIEWER" | null)[] = ["OWNER", "EDITOR", "VIEWER", null];

  it("canViewThread: everyone with a role, nobody without", () => {
    expect(roles.map(canViewThread)).toEqual([true, true, true, false]);
  });

  it("canManageThreadMeta (rename/change color): OWNER and EDITOR only", () => {
    expect(roles.map(canManageThreadMeta)).toEqual([true, true, false, false]);
  });

  it("canCloseOrDeleteThread: OWNER only", () => {
    expect(roles.map(canCloseOrDeleteThread)).toEqual([true, false, false, false]);
  });

  it("canManageTasks (create/edit/move/link/delete tasks): OWNER and EDITOR only", () => {
    expect(roles.map(canManageTasks)).toEqual([true, true, false, false]);
  });

  it("canComment: OWNER, EDITOR, and VIEWER", () => {
    expect(roles.map(canComment)).toEqual([true, true, true, false]);
  });

  it("canManageShares (invite/revoke collaborators): OWNER only", () => {
    expect(roles.map(canManageShares)).toEqual([true, false, false, false]);
  });
});
