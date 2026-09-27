"use client";

import { useCallback, useSyncExternalStore } from "react";

// Which thread clusters are open on the canvas, most recently opened last
// (so Esc can close the newest one). A per-viewer convenience, so it lives
// in localStorage rather than the database. Read through
// useSyncExternalStore (like lib/useIsMobile.ts): the server render sees
// nothing open, and the stored value takes over after hydration.

const EMPTY: string[] = [];
const listeners = new Set<() => void>();
// Fallback when localStorage throws (private mode, blocked site data):
// open state still works for this page load, it just doesn't persist.
const memory = new Map<string, string>();
// Parsed snapshots cached by their raw string, so useSyncExternalStore
// gets a stable array identity until the value actually changes.
const snapshots = new Map<string, { raw: string; ids: string[] }>();

function storageKey(userId: string) {
  return `arc.openThreads.${userId}`;
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function parse(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(userId: string): string[] {
  const key = storageKey(userId);
  const raw = readRaw(key);
  if (raw === null) return EMPTY;
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.ids;
  const ids = parse(raw);
  snapshots.set(key, { raw, ids });
  return ids;
}

function write(userId: string, ids: string[]) {
  const key = storageKey(userId);
  const raw = JSON.stringify(ids);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keeps other tabs of the canvas in sync.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useOpenThreads(userId: string) {
  const openIds = useSyncExternalStore(
    subscribe,
    () => getSnapshot(userId),
    () => EMPTY
  );

  const update = useCallback(
    (change: (ids: string[]) => string[]) => write(userId, change(getSnapshot(userId))),
    [userId]
  );

  const isOpen = useCallback((id: string) => openIds.includes(id), [openIds]);
  const open = useCallback((id: string) => update((ids) => [...ids.filter((x) => x !== id), id]), [update]);
  const close = useCallback((id: string) => update((ids) => ids.filter((x) => x !== id)), [update]);
  const closeMostRecent = useCallback(() => update((ids) => ids.slice(0, -1)), [update]);

  return { openIds, isOpen, open, close, closeMostRecent };
}
