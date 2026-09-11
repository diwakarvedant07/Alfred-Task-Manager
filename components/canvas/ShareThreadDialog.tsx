"use client";

import { useState } from "react";

type ShareItem = {
  id: string;
  permission: "VIEWER" | "EDITOR";
  sharedWithUser: { name: string; email: string };
};

export default function ShareThreadDialog({
  threadId,
  onShare,
  onOpen,
  shares,
  onRevoke,
}: {
  threadId: string;
  onShare: (email: string, permission: "VIEWER" | "EDITOR") => void;
  // Fired when the dialog is opened, so the caller can lazily fetch the
  // current share list (listThreadShares) rather than loading it for every
  // thread up front. Optional — omitting it just means no share list shows.
  onOpen?: () => void;
  shares?: ShareItem[];
  onRevoke?: (shareId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        Share
      </button>
    );
  }

  return (
    <div role="dialog" aria-label={`Share thread ${threadId}`}>
      <label>
        Email
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Permission
        <select
          aria-label="Permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value as "VIEWER" | "EDITOR")}
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </select>
      </label>
      <button
        onClick={() => {
          onShare(email, permission);
          setOpen(false);
        }}
      >
        Share thread
      </button>

      {shares && shares.length > 0 && (
        <ul aria-label="Current shares">
          {shares.map((share) => (
            <li key={share.id}>
              <span>
                {share.sharedWithUser.name} ({share.sharedWithUser.email}) — {share.permission}
              </span>
              <button onClick={() => onRevoke?.(share.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
