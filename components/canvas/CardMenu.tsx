"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

// Optional controlled mode: a parent that opens the menu some other way
// (long-press/right-click on a canvas bubble) passes open/onOpenChange and
// hideTrigger to render just the popover without the ⋮ button.
type ControlProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

type TaskMenuProps = ControlProps & {
  variant: "task";
  onRename: () => void;
  onMoveToThread: () => void;
  onLinkSecondaryThread: () => void;
  onDelete: () => void;
};

type ThreadMenuProps = ControlProps & {
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

const menuItemClassName =
  "block w-full rounded-lg px-3 py-2 text-left text-sm text-fg/85 transition-colors hover:bg-fg/[0.07] hover:text-fg";

const dangerItemClassName =
  "block w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10";

export default function CardMenu(props: TaskMenuProps | ThreadMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open! : uncontrolledOpen;
  const { onOpenChange } = props;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Closes the menu on any pointer interaction outside it -- e.g. clicking
  // the canvas backdrop behind it. Without this, the menu only ever closed
  // via one of its own menu items, so clicking elsewhere left it open.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, setOpen]);

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
      ref={containerRef}
      data-testid="card-menu-trigger-area"
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onClick={(e) => e.stopPropagation()}
      className="relative"
    >
      {!props.hideTrigger && (
        <button
          aria-label="More actions"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-7 w-7 items-center justify-center rounded-lg pointer-coarse:h-9 pointer-coarse:w-9 text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg"
        >
          <MoreVertical size={16} />
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="elevated absolute right-0 z-30 mt-1 w-52 origin-top-right animate-pop-in rounded-xl border border-fg/10 bg-surface p-1 font-normal"
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
              <div aria-hidden className="my-1 h-px bg-fg/10" />
              <button role="menuitem" className={dangerItemClassName} onClick={() => runAndClose(props.onDelete)}>
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
                  <button role="menuitem" className={dangerItemClassName} onClick={() => runAndClose(props.onDelete)}>
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
