import {
  connectNotificationSocket,
  isApiError,
  type LiveStatus,
  type PushSubscriptionRequest,
} from "@medilink/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useApi } from "../../app/services";
import { usePatientMe } from "../../auth/queries";
import { env } from "../../env";
import { pushClient, type PushPermission, type PushSupport } from "./pushClient";

export const notificationKeys = {
  all: ["notifications"] as const,
  count: ["notifications", "count"] as const,
  list: (params: Record<string, unknown>) => ["notifications", "list", params] as const,
  detail: (id: string) => ["notifications", "detail", id] as const,
  preferences: ["notifications", "preferences"] as const,
  pushKey: ["notifications", "push-key"] as const,
  subscriptions: ["notifications", "push-subscriptions"] as const,
};

export const POLL_MS = 60_000;

// ---- socket (one per tab) ----------------------------------------------------------------------

let status: LiveStatus = "connecting";
const listeners = new Set<() => void>();
const setStatus = (next: LiveStatus) => {
  status = next;
  for (const listener of listeners) listener();
};
const subscribeStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
let users = 0;
let connection: { close: () => void } | null = null;

/** Live inbox (notify-then-fetch): messages invalidate the queries; a reconnect refetches. */
export function useNotificationSocket(enabled: boolean): LiveStatus {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    users += 1;
    connection ??= connectNotificationSocket({
      baseUrl: env.apiBaseUrl,
      audience: "patient",
      onStatus: setStatus,
      onReconnect: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.count }),
      onMessage: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    });
    return () => {
      users -= 1;
      if (users === 0) {
        connection?.close();
        connection = null;
        setStatus("connecting");
      }
    };
  }, [enabled, queryClient]);
  return useSyncExternalStore(
    subscribeStatus,
    () => status,
    () => status,
  );
}

// ---- queries ------------------------------------------------------------------------------------

export function useUnreadCount() {
  const api = useApi();
  const { data: me } = usePatientMe();
  const live = useNotificationSocket(Boolean(me));
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => api.notifications.patient.unreadCount(),
    enabled: Boolean(me),
    refetchInterval: live === "live" ? false : POLL_MS,
    staleTime: 10_000,
  });
}

export function usePreferences() {
  const api = useApi();
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: () => api.notifications.patient.preferences(),
    staleTime: 60_000,
  });
}

export function useMarkRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.patient.markRead(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (before?: string) => api.notifications.patient.markAllRead(before),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/** Names of the people an account cares for, for the "About Keza" chip. */
export function useDependentNames(): (patientId: string | null) => string | null {
  const prefs = usePreferences();
  return (patientId) =>
    patientId
      ? (prefs.data?.dependents.find((d) => d.patient_id === patientId)?.display_name ?? null)
      : null;
}

/** Only in-app paths (open-redirect guard). */
export function safeActionPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}

// ---- push on this browser ----------------------------------------------------------------------

export type PushState =
  | "loading"
  /** The server has no VAPID keys: push is off for everyone, opt-in hidden. */
  | "disabled"
  | "unsupported"
  | "ios-not-installed"
  | "denied"
  | "off"
  | "on";

function deriveState(
  enabled: boolean | undefined,
  support: PushSupport,
  permission: PushPermission,
  subscribed: boolean | undefined,
): PushState {
  if (enabled === undefined || subscribed === undefined) return "loading";
  if (!enabled) return "disabled";
  if (support !== "supported") return support;
  if (permission === "denied") return "denied";
  return permission === "granted" && subscribed ? "on" : "off";
}

/**
 * Push opt-in state and actions. `turnOn` asks for permission (call it from a button press),
 * subscribes with the server's key and posts the subscription; `turnOff` deletes this browser's
 * row and unsubscribes it.
 */
export function usePush() {
  const api = useApi();
  const queryClient = useQueryClient();
  const client = pushClient();
  const key = useQuery({
    queryKey: notificationKeys.pushKey,
    queryFn: () => api.notifications.public.webPushKey(),
    staleTime: 10 * 60_000,
  });
  const [permission, setPermission] = useState<PushPermission>(() => client.permission());
  const current = useQuery({
    queryKey: [...notificationKeys.pushKey, "current"],
    queryFn: async () => (await client.current()) ?? false,
  });
  const support = client.support();
  const state = deriveState(
    key.data?.is_enabled,
    support,
    permission,
    current.data === undefined ? undefined : Boolean(current.data),
  );

  const post = useCallback(
    (body: PushSubscriptionRequest) => api.notifications.patient.subscribePush(body),
    [api],
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.pushKey });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.subscriptions });
  };

  const turnOn = useMutation({
    mutationFn: async () => {
      const publicKey = key.data?.public_key;
      if (!publicKey) throw new Error("push_disabled");
      const granted = await client.requestPermission();
      setPermission(granted);
      if (granted !== "granted") return null;
      return post(await client.subscribe(publicKey));
    },
    onSettled: refresh,
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      const mine = await client.current();
      if (mine) {
        try {
          // Re-posting is idempotent and tells us which row is this browser's.
          const row = await post(mine);
          await api.notifications.patient.removePushSubscription(row.id);
        } catch (error) {
          if (!isApiError(error) || error.status !== 404) throw error;
        }
      }
      await client.unsubscribe();
    },
    onSettled: refresh,
  });

  return { state, publicKey: key.data?.public_key ?? null, turnOn, turnOff };
}

/**
 * On app start (contract §6.2): when permission is granted, re-post the current subscription
 * (idempotent) and re-subscribe when the server's VAPID key changed.
 */
export function usePushResync(enabled: boolean): void {
  const api = useApi();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!enabled || done) return;
    const client = pushClient();
    if (client.support() !== "supported" || client.permission() !== "granted") return;
    let cancelled = false;
    void (async () => {
      try {
        const key = await api.notifications.public.webPushKey();
        if (cancelled || !key.is_enabled || !key.public_key) return;
        const mine = await client.current();
        if (!mine) return;
        const body = (await client.matchesKey(key.public_key))
          ? mine
          : await client.subscribe(key.public_key);
        await api.notifications.patient.subscribePush(body);
      } catch {
        // Best effort: the next start tries again.
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, enabled, done]);
}
