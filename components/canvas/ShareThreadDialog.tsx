"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

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
  onOpen?: () => void;
  shares?: ShareItem[];
  onRevoke?: (shareId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        Share
      </Button>
    );
  }

  return (
    <Modal ariaLabel={`Share thread ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text,#eafcff)]">Share thread</h2>
      <div className="flex flex-col gap-4">
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select
          label="Permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value as "VIEWER" | "EDITOR")}
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </Select>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onShare(email, permission);
            setOpen(false);
          }}
        >
          Share thread
        </Button>
      </div>

      {shares && shares.length > 0 && (
        <ul
          aria-label="Current shares"
          className="mt-6 flex flex-col gap-2 border-t border-[var(--text,#eafcff)]/10 pt-4"
        >
          {shares.map((share) => (
            <li
              key={share.id}
              className="flex items-center justify-between gap-2 text-sm text-[var(--text,#eafcff)]/80"
            >
              <span>
                {share.sharedWithUser.name} ({share.sharedWithUser.email}) — {share.permission}
              </span>
              <Button variant="secondary" onClick={() => onRevoke?.(share.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
