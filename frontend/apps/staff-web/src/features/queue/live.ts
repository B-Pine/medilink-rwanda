import { connectLive, queueSockets, socketUrl, type LiveStatus } from "@medilink/api-client";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { env } from "../../env";

/**
 * One queue socket per tab (contract §6.1): messages invalidate the matching queries
 * (notify-then-fetch). Without a socket (mocks, or reconnecting) queries poll every 15 s, so a
 * board never stays stale. The status drives the shell's live indicator (design 04 §5).
 */
export const queueKeys = {
  all: ["queue"] as const,
  board: ["queue", "board"] as const,
  mine: ["queue", "mine"] as const,
  visit: (id: string) => ["queue", "visit", id] as const,
  reorders: ["queue", "reorders"] as const,
  displays: ["queue", "displays"] as const,
};

interface LiveState {
  status: LiveStatus;
  updatedAt: number;
  pending: number;
}

let state: LiveState = {
  status: env.useMocks ? "live" : "connecting",
  updatedAt: Date.now(),
  pending: 0,
};
const listeners = new Set<() => void>();
const emit = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};

export const liveStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
  touched: () => emit({ updatedAt: Date.now() }),
  setPending: (pending: number) => emit({ pending }),
  setStatus: (status: LiveStatus) => emit({ status }),
};

export function useLiveState(): LiveState {
  return useSyncExternalStore(liveStore.subscribe, liveStore.get, liveStore.get);
}

/** Poll interval for queue queries: none while the socket is live. */
export function usePollInterval(): number | false {
  const { status } = useLiveState();
  return status === "live" && !env.useMocks ? false : 15_000;
}

let users = 0;
let connection: { close: () => void } | null = null;

export function useQueueSocket(enabled: boolean): void {
  const queryClient = useQueryClient();
  // A successful queue fetch (polling without a socket, or after a message) is fresh data too.
  useEffect(() => {
    if (!enabled) return;
    return queryClient.getQueryCache().subscribe((event) => {
      const key = (event.query as Query).queryKey;
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        key[0] === queueKeys.all[0]
      ) {
        emit({ updatedAt: Date.now() });
      }
    });
  }, [enabled, queryClient]);
  useEffect(() => {
    if (!enabled) return;
    if (env.useMocks) {
      // Mock mode has no socket: stand in for its 25 s pong so the indicator stays "Live".
      const timer = setInterval(() => emit({ updatedAt: Date.now() }), 10_000);
      return () => clearInterval(timer);
    }
    users += 1;
    if (!connection) {
      connection = connectLive(socketUrl(env.apiBaseUrl, queueSockets.staff), {
        onStatus: (status) => emit({ status }),
        onAlive: () => emit({ updatedAt: Date.now() }),
        onMessage: () => {
          emit({ updatedAt: Date.now() });
          void queryClient.invalidateQueries({ queryKey: queueKeys.all });
        },
      });
    }
    return () => {
      users -= 1;
      if (users === 0) {
        connection?.close();
        connection = null;
      }
    };
  }, [enabled, queryClient]);
}
