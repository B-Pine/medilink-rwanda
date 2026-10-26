/**
 * WebSocket client for notify-then-fetch (contract sprint-04 §3.3, design 04 §5): reconnects with
 * exponential backoff, pings to keep proxies from closing idle sockets, and reports a status the
 * shell shows ("Live", "Reconnecting", "Offline"). Messages carry IDs only; callers refetch.
 */

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline" | "closed";

export interface LiveMessage {
  type: string;
  [key: string]: unknown;
}

export interface LiveConnection {
  close: () => void;
}

export interface LiveOptions {
  onMessage: (message: LiveMessage) => void;
  onStatus?: (status: LiveStatus) => void;
  /** For tests: a WebSocket constructor. */
  WebSocketImpl?: typeof WebSocket;
  pingMs?: number;
  maxBackoffMs?: number;
}

/** `http://host:8000` + `/ws/v1/…` → `ws://host:8000/ws/v1/…`. */
export function socketUrl(apiBaseUrl: string, path: string): string {
  const base = new URL(
    apiBaseUrl,
    typeof window === "undefined" ? undefined : window.location.href,
  );
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = "";
  return base.toString();
}

/** Close code the server uses for an unauthenticated or revoked session (core.realtime). */
export const CLOSE_UNAUTHENTICATED = 4401;

export function connectLive(url: string, options: LiveOptions): LiveConnection {
  const Impl = options.WebSocketImpl ?? (typeof WebSocket === "undefined" ? undefined : WebSocket);
  const ping = options.pingMs ?? 25_000;
  const maxBackoff = options.maxBackoffMs ?? 30_000;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const status = (value: LiveStatus) => options.onStatus?.(value);

  const schedule = () => {
    if (stopped) return;
    const delay = Math.min(maxBackoff, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    attempt += 1;
    status(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
    retryTimer = setTimeout(open, delay);
  };

  function open() {
    if (stopped || !Impl) return;
    status(attempt === 0 ? "connecting" : "reconnecting");
    try {
      socket = new Impl(url);
    } catch {
      schedule();
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      status("live");
      pingTimer = setInterval(() => {
        if (socket?.readyState === 1) socket.send(JSON.stringify({ type: "ping" }));
      }, ping);
    };
    socket.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as LiveMessage;
        if (message && typeof message.type === "string" && message.type !== "pong") {
          options.onMessage(message);
        }
      } catch {
        // not JSON: ignore
      }
    };
    socket.onclose = (event: CloseEvent) => {
      clearInterval(pingTimer);
      socket = null;
      if (event.code === CLOSE_UNAUTHENTICATED) {
        stopped = true;
        status("closed");
        return;
      }
      schedule();
    };
    socket.onerror = () => {
      socket?.close();
    };
  }

  const wake = () => {
    if (stopped || socket) return;
    clearTimeout(retryTimer);
    attempt = 0;
    open();
  };
  if (typeof window !== "undefined") window.addEventListener("online", wake);

  open();
  return {
    close: () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      if (typeof window !== "undefined") window.removeEventListener("online", wake);
      socket?.close();
      socket = null;
    },
  };
}
