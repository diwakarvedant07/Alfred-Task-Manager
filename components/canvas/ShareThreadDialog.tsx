"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import FormAlert from "@/components/ui/FormAlert";

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
  // May return a Promise (Canvas.tsx's handler does) -- the confirm button
  // awaits it before closing, so the dialog staying open (with an error
  // alert) is the caller's cue that the share didn't take, e.g. an
  // unregistered recipient email rejecting shareThread's findUniqueOrThrow.
  onShare: (email: string, permission: "VIEWER" | "EDITOR") => void | Promise<void>;
  // Fired when the dialog is opened, so the caller can lazily fetch the
  // current share list (listThreadShares) rather than loading it for every
  // thread up front. Optional — omitting it just means no share list shows.
  onOpen?: () => void;
  shares?: ShareItem[];
  onRevoke?: (shareId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShareClick() {
    setError(null);
    setSharing(true);
    try {
      await onShare(email, permission);
      setOpen(false);
      setEmail("");
    } catch {
      setError("Couldn't share this thread — check the email and try again.");
    } finally {
      setSharing(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          setError(null);
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
        <Input
          label="Email"
          value={email}
          disabled={sharing}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label="Permission"
          value={permission}
          disabled={sharing}
          onChange={(e) => setPermission(e.target.value as "VIEWER" | "EDITOR")}
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </Select>
        {error && <FormAlert>{error}</FormAlert>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={sharing}>
          Cancel
        </Button>
        <Button onClick={handleShareClick} loading={sharing}>
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
