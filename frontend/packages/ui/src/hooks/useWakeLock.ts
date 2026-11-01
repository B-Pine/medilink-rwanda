import { useEffect, useState } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

export interface WakeLockState {
  /** The browser has the Screen Wake Lock API. */
  supported: boolean;
  /** The screen is being kept on now. */
  active: boolean;
}

function wakeLockApi(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return api && typeof api.request === "function" ? api : null;
}

/**
 * Keep the screen on while `enabled` (FR-NOT-12 groundwork; S4's tracker uses it while a patient
 * waits to be called). Feature-detects `navigator.wakeLock`, re-acquires the lock when the page
 * becomes visible again (browsers release it on hide) and releases it on unmount. Fails quietly:
 * a refused lock (battery saver, no user gesture) just leaves `active` false.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const supported = wakeLockApi() !== null;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = wakeLockApi();
    if (!enabled || !api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || (sentinel && !sentinel.released)) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const next = await api.request("screen");
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setActive(true);
      } catch {
        setActive(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
      else setActive(false);
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}
