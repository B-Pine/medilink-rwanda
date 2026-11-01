import type { PushSubscriptionRequest } from "@medilink/api-client";

import { env } from "../../env";

/**
 * Browser side of web push (contract §6.2). The permission prompt is only ever triggered by
 * `requestPermission()`, which the UI calls from a button press (FR-NOT-03, analysis 09 §2).
 * With VITE_USE_MOCKS=true a fake client stands in (MSW owns the service worker in mock mode).
 */

export type PushSupport = "supported" | "unsupported" | "ios-not-installed";
export type PushPermission = "default" | "granted" | "denied";

export interface PushClient {
  support(): PushSupport;
  permission(): PushPermission;
  /** Shows the browser prompt: call it only from a user gesture. */
  requestPermission(): Promise<PushPermission>;
  /** This browser's subscription, or null. */
  current(): Promise<PushSubscriptionRequest | null>;
  /** Subscribe with the server's VAPID key (re-subscribes when the key changed). */
  subscribe(publicKey: string): Promise<PushSubscriptionRequest>;
  /** Was the current subscription made with this key? */
  matchesKey(publicKey: string): Promise<boolean>;
  unsubscribe(): Promise<void>;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toRequest(subscription: PushSubscription): PushSubscriptionRequest {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    expiration_time: json.expirationTime ?? null,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandalone = () =>
  (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** `navigator.serviceWorker.ready` never settles without a worker (dev builds): time out. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export function createBrowserPushClient(): PushClient {
  const supported = () =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    support: () => {
      if (supported()) return "supported";
      // iOS 16.4+ offers web push only to apps added to the Home Screen.
      return isIos() && !isStandalone() ? "ios-not-installed" : "unsupported";
    },
    permission: () => (supported() ? Notification.permission : "default"),
    requestPermission: async () =>
      supported() ? await Notification.requestPermission() : "denied",
    current: async () => {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      return sub ? toRequest(sub) : null;
    },
    matchesKey: async (publicKey) => {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      const key = sub?.options.applicationServerKey;
      if (!key) return false;
      const a = new Uint8Array(key);
      const b = base64UrlToBytes(publicKey);
      return a.length === b.length && a.every((value, index) => value === b[index]);
    },
    subscribe: async (publicKey) => {
      const reg = await registration();
      if (!reg) throw new Error("no_service_worker");
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const key = existing.options.applicationServerKey;
        const wanted = base64UrlToBytes(publicKey);
        const same =
          key &&
          new Uint8Array(key).length === wanted.length &&
          new Uint8Array(key).every((v, i) => v === wanted[i]);
        if (same) return toRequest(existing);
        await existing.unsubscribe();
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      return toRequest(sub);
    },
    unsubscribe: async () => {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    },
  };
}

/** An allowlisted endpoint and well-formed keys (65 and 16 bytes), for mock mode and tests. */
export function createFakePushClient(
  options: { support?: PushSupport; permission?: PushPermission; grant?: PushPermission } = {},
): PushClient & { prompts: number } {
  let permission: PushPermission = options.permission ?? "default";
  let subscription: PushSubscriptionRequest | null = null;
  let key: string | null = null;
  const client = {
    prompts: 0,
    support: () => options.support ?? "supported",
    permission: () => permission,
    requestPermission: () => {
      client.prompts += 1;
      if (permission === "default") permission = options.grant ?? "granted";
      return Promise.resolve(permission);
    },
    current: () => Promise.resolve(subscription),
    matchesKey: (publicKey: string) => Promise.resolve(key === publicKey),
    subscribe: (publicKey: string) => {
      if (permission !== "granted") return Promise.reject(new Error("not_allowed"));
      if (!subscription || key !== publicKey) {
        subscription = {
          endpoint: `https://fcm.googleapis.com/fcm/send/mock-${crypto.randomUUID()}`,
          expiration_time: null,
          keys: { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) },
        };
        key = publicKey;
      }
      return Promise.resolve(subscription);
    },
    unsubscribe: () => {
      subscription = null;
      key = null;
      return Promise.resolve();
    },
  };
  return client;
}

let client: PushClient | null = null;

export function pushClient(): PushClient {
  client ??= env.useMocks ? createFakePushClient() : createBrowserPushClient();
  return client;
}

/** Tests: swap the client (null = back to the default). */
export function setPushClient(next: PushClient | null): void {
  client = next;
}
