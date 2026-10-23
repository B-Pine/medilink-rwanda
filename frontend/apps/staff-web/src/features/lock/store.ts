import { useSyncExternalStore } from "react";

/**
 * Lock state of this staff session, shared by the idle timer, the 401 `session_locked` hook and
 * other tabs (BroadcastChannel). Memory only: nothing about the lock is stored in the browser.
 */
type Listener = () => void;

const CHANNEL = "medilink-staff-lock";

export interface LockStore {
  isLocked(): boolean;
  /** Lock locally (and tell other tabs unless the message came from one). */
  setLocked(locked: boolean, options?: { broadcast?: boolean }): void;
  subscribe(listener: Listener): () => void;
  close(): void;
}

export function createLockStore(): LockStore {
  let locked = false;
  const listeners = new Set<Listener>();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);

  const set = (next: boolean, broadcast: boolean) => {
    if (locked === next) return;
    locked = next;
    if (broadcast) channel?.postMessage({ type: next ? "locked" : "unlocked" });
    for (const listener of listeners) listener();
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "locked") set(true, false);
      if (event.data?.type === "unlocked") set(false, false);
    };
  }

  return {
    isLocked: () => locked,
    setLocked: (next, options) => set(next, options?.broadcast ?? true),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => channel?.close(),
  };
}

export function useLocked(store: LockStore): boolean {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.isLocked(),
    () => store.isLocked(),
  );
}
