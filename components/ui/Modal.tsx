"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  ariaLabel,
  onClose,
  children,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Move focus into the dialog on open and restore it to whatever triggered
  // the dialog on close — without this, a keyboard/screen-reader user has no
  // indication focus moved into an overlay rather than staying in the
  // (now-obscured) page behind it.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  // Portalled to document.body: Canvas.tsx renders each dialog-opening
  // button inside a `position: absolute; z-index: 10` toolbar, which forms
  // its own stacking context. A `position: fixed` descendant does NOT escape
  // an ancestor's stacking context, so without the portal this backdrop's
  // z-40 only wins against other elements inside that same z-index:10
  // context -- it still loses to siblings like JarvisPanel (z-30) and the
  // task-detail rail (zIndex 20) at the root level, regardless of this
  // component's own z-index.
  // z-[200]: must clear JarvisWorkspace (z-[110]) and the resized canvas
  // strip it sits alongside when open (z-[115]) -- dialogs like
  // NewThreadButton's are triggered from inside that resized canvas.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/55 p-4"
      onClick={(e) => {
        // Only the backdrop itself should close the dialog. Checking the
        // click's target (rather than stopping propagation on the card)
        // also survives a text-selection drag that starts inside the card
        // and releases outside it -- that gesture's click target is still
        // the card's contents, not the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-6 shadow-2xl outline-none"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
