"use client";

import { useRef, useState } from "react";

type TaskMenuProps = {
  variant: "task";
  onRename: () => void;
  onMoveToThread: () => void;
  onLinkSecondaryThread: () => void;
  onDelete: () => void;
};

type ThreadMenuProps = {
  variant: "thread";
  onRename: () => void;
  onChangeColor: () => void;
  onClose: () => void;
  onDelete: () => void;
  onViewCatchUp: () => void;
  // Mirrors lib/permissions.ts's canManageThreadMeta/canCloseOrDeleteThread,
  // which the Server Actions these buttons call already enforce — hiding
  // the items here just keeps the UI from offering something the server
  // will reject. Default true so existing callers/tests that don't pass
  // these (and can't know a role) keep seeing every item.
  canEditMeta?: boolean;
  canCloseOrDelete?: boolean;
};

const LONG_PRESS_MS = 450;

export default function CardMenu(props: TaskMenuProps | ThreadMenuProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startLongPress() {
    timerRef.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function runAndClose(handler: () => void) {
    handler();
    setOpen(false);
  }

  return (
    <div
      data-testid="card-menu-trigger-area"
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "relative" }}
    >
      <button aria-label="More actions" onClick={() => setOpen((o) => !o)}>
        ⋮
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", background: "var(--panel-bg)" }}>
          {props.variant === "task" ? (
            <>
              <button role="menuitem" onClick={() => runAndClose(props.onRename)}>Rename</button>
              <button role="menuitem" onClick={() => runAndClose(props.onMoveToThread)}>Move to thread…</button>
              <button role="menuitem" onClick={() => runAndClose(props.onLinkSecondaryThread)}>Link secondary thread…</button>
              <button role="menuitem" onClick={() => runAndClose(props.onDelete)}>Delete</button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => runAndClose(props.onViewCatchUp)}>View catch-up</button>
              {(props.canEditMeta ?? true) && (
                <>
                  <button role="menuitem" onClick={() => runAndClose(props.onRename)}>Rename thread</button>
                  <button role="menuitem" onClick={() => runAndClose(props.onChangeColor)}>Change category color</button>
                </>
              )}
              {(props.canCloseOrDelete ?? true) && (
                <>
                  <button role="menuitem" onClick={() => runAndClose(props.onClose)}>Close thread</button>
                  <button role="menuitem" onClick={() => runAndClose(props.onDelete)}>Delete thread</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
