import {
  connectNotificationSocket,
  type LiveStatus,
  type NotificationSocketMessage,
} from "@medilink/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { env } from "../../env";

/** TanStack Query keys of the staff notifications feature. */
export const notificationKeys = {
  all: ["notifications"] as const,
  count: ["notifications", "count"] as const,
  latest: ["notifications", "latest"] as const,
  list: (params: Record<string, unknown>) => ["notifications", "list", params] as const,
  detail: (id: string) => ["notifications", "detail", id] as const,
  preferences: ["notifications", "preferences"] as const,
  announcements: (scope: "facility" | "platform") => ["announcements", scope] as const,
  announcement: (scope: "facility" | "platform", id: string) =>
    ["announcements", scope, "detail", id] as const,
};

/** Poll the unread count every 60 s while the socket is down (contract §6.1). */
export const POLL_MS = 60_000;

let status: LiveStatus = "connecting";
const listeners = new Set<() => void>();
const setStatus = (next: LiveStatus) => {
  status = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useNotificationSocketStatus(): LiveStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

/** `refetchInterval` for the unread count: none while live. */
export function useCountPollInterval(): number | false {
  return useNotificationSocketStatus() === "live" ? false : POLL_MS;
}

/**
 * One staff notification socket per tab (notify-then-fetch): every message invalidates the
 * notification queries (other tabs' reads arrive as `notification.read`), a reconnect refetches
 * the count, and `onCreated` lets the bell announce and play its sound.
 */
export function useNotificationSocket(
  enabled: boolean,
  onCreated: (
    message: Extract<NotificationSocketMessage, { type: "notification.created" }>,
  ) => void,
): void {
  const queryClient = useQueryClient();
  const created = useRef(onCreated);
  useEffect(() => {
    created.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (!enabled) return;
    const connection = connectNotificationSocket({
      baseUrl: env.apiBaseUrl,
      audience: "staff",
      onStatus: setStatus,
      onReconnect: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.count }),
      onMessage: (message) => {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        if (message.type === "notification.created") created.current(message);
      },
    });
    return () => {
      connection.close();
      setStatus("connecting");
    };
  }, [enabled, queryClient]);
}

/** Only in-app paths: `/…`, never `//host` or a scheme (open-redirect guard). */
export function safeActionPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}
