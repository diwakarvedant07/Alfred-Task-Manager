"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
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
  threadName,
  compact = false,
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
  // Shown in the dialog heading; purely presentational.
  threadName?: string;
  // Icon-only trigger for the canvas threads panel.
  compact?: boolean;
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
    const openDialog = () => {
      setOpen(true);
      setError(null);
      onOpen?.();
    };
    return compact ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Share"
        title={threadName ? `Share ${threadName}` : "Share"}
        onClick={openDialog}
        className="h-7 w-7 rounded-lg"
      >
        <UserPlus size={14} />
      </Button>
    ) : (
      <Button variant="secondary" size="sm" onClick={openDialog}>
        Share
      </Button>
    );
  }

  return (
    <Modal ariaLabel={`Share thread ${threadId}`} onClose={() => setOpen(false)}>
      <h2 className="text-lg font-semibold tracking-tight">Share thread</h2>
      <p className="mb-5 mt-1 text-sm text-fg/55">
        {threadName ? (
          <>
            Invite someone to <span className="font-medium text-fg/80">{threadName}</span>.
          </>
        ) : (
          "Invite someone to this thread."
        )}{" "}
        Viewers can read and comment; editors can change tasks.
      </p>
      <div className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="teammate@example.com"
          autoFocus
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
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={sharing}>
          Cancel
        </Button>
        <Button onClick={handleShareClick} loading={sharing} disabled={email.trim() === ""}>
          Share thread
        </Button>
      </div>

      {shares && shares.length > 0 && (
        <ul
          aria-label="Current shares"
          className="mt-6 flex flex-col gap-1 border-t border-fg/10 pt-4"
        >
          <li className="pb-1 text-[11px] font-medium uppercase tracking-wider text-fg/40">People with access</li>
          {shares.map((share) => (
            <li key={share.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-fg/[0.04]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {share.sharedWithUser.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{share.sharedWithUser.name}</span>
                  <span className="block truncate text-xs text-fg/50">
                    {share.sharedWithUser.email} · {share.permission === "EDITOR" ? "Editor" : "Viewer"}
                  </span>
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => onRevoke?.(share.id)} className="hover:text-red-500">
                <X size={14} />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
