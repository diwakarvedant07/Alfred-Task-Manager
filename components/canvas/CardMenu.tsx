"use client";

import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

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
  canEditMeta?: boolean;
  canCloseOrDelete?: boolean;
};

const LONG_PRESS_MS = 450;

const menuItemClassName =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--text,#eafcff)] hover:bg-[var(--text,#eafcff)]/10";

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
      className="relative"
    >
      <button
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text,#eafcff)]/70 hover:bg-[var(--text,#eafcff)]/10 hover:text-[var(--text,#eafcff)]"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-1 shadow-xl"
        >
          {props.variant === "task" ? (
            <>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onRename)}>
                Rename
              </button>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onMoveToThread)}>
                Move to thread…
              </button>
              <button
                role="menuitem"
                className={menuItemClassName}
                onClick={() => runAndClose(props.onLinkSecondaryThread)}
              >
                Link secondary thread…
              </button>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onDelete)}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onViewCatchUp)}>
                View catch-up
              </button>
              {(props.canEditMeta ?? true) && (
                <>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onRename)}>
                    Rename thread
                  </button>
                  <button
                    role="menuitem"
                    className={menuItemClassName}
                    onClick={() => runAndClose(props.onChangeColor)}
                  >
                    Change category color
                  </button>
                </>
              )}
              {(props.canCloseOrDelete ?? true) && (
                <>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onClose)}>
                    Close thread
                  </button>
                  <button role="menuitem" className={menuItemClassName} onClick={() => runAndClose(props.onDelete)}>
                    Delete thread
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
