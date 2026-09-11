"use client";

import { useState } from "react";

export default function ShareThreadDialog({
  threadId,
  onShare,
}: {
  threadId: string;
  onShare: (email: string, permission: "VIEWER" | "EDITOR") => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");

  if (!open) {
    return <button onClick={() => setOpen(true)}>Share</button>;
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
    </div>
  );
}
