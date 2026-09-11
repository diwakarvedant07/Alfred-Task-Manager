export type ThreadRole = "OWNER" | "EDITOR" | "VIEWER" | null;

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

export function resolveThreadRole(input: {
  ownerId: string;
  shares: { sharedWithUserId: string; permission: "VIEWER" | "EDITOR" }[];
  userId: string;
}): ThreadRole {
  if (input.ownerId === input.userId) return "OWNER";
  const share = input.shares.find((s) => s.sharedWithUserId === input.userId);
  return share ? share.permission : null;
}

export function canViewThread(role: ThreadRole): boolean {
  return role !== null;
}

export function canManageThreadMeta(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canCloseOrDeleteThread(role: ThreadRole): boolean {
  return role === "OWNER";
}

export function canManageTasks(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canComment(role: ThreadRole): boolean {
  return role === "OWNER" || role === "EDITOR" || role === "VIEWER";
}

export function canManageShares(role: ThreadRole): boolean {
  return role === "OWNER";
}
