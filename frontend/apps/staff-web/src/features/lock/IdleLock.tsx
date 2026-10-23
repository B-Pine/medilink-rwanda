import { Button, Dialog } from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useApi, useServices } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { LockScreen, lockStateKey } from "./LockScreen";
import { useLocked } from "./store";

const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
/** Keep the server's idle clock in step with real activity (it only sees requests). */
const KEEPALIVE_MS = 2 * 60_000;

/**
 * Idle lock (contract §6.1): a timer from `me.security.lock_after_seconds`, reset by user input
 * only (not by background requests); a warning 60 s before with "Stay signed in"; then
 * POST /staff/auth/lock/ and the lock screen. While locked the shell is `inert`, hidden from
 * assistive technology and visually hidden, but stays mounted so unsaved form state is kept.
 * Lock and unlock sync across tabs.
 */
export function IdleLock() {
  const { t } = useTranslation();
  const api = useApi();
  const { lock: store } = useServices();
  const locked = useLocked(store);
  const { data: me } = useStaffMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sentinel = useRef<HTMLSpanElement>(null);
  const [warning, setWarning] = useState(false);
  // Set when the timers start (effects below), not during render.
  const lastActivity = useRef(0);
  const lastKeepAlive = useRef(0);
  const lockAfter = (me?.security.lock_after_seconds ?? 900) * 1000;

  const lockNow = useCallback(() => {
    setWarning(false);
    store.setLocked(true);
    void api.security.lock().catch(() => undefined);
  }, [api, store]);

  // Activity resets the timer (and occasionally tells the server we're still here).
  useEffect(() => {
    if (locked) return;
    lastKeepAlive.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (Date.now() - lastKeepAlive.current > KEEPALIVE_MS) {
        lastKeepAlive.current = Date.now();
        void api.staffAuth.me().catch(() => undefined);
      }
    };
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, onActivity, { passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [api, locked]);

  // One ticker drives the warning and the lock.
  useEffect(() => {
    if (locked) return;
    lastActivity.current = Date.now();
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= lockAfter) lockNow();
      else setWarning(idle >= lockAfter - WARNING_SECONDS * 1000);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [locked, lockAfter, lockNow]);

  // Hide and disable the shell while locked; keep it mounted (unsaved state survives).
  useEffect(() => {
    const shell = sentinel.current?.parentElement;
    if (!shell) return;
    if (locked) {
      shell.setAttribute("inert", "");
      shell.setAttribute("aria-hidden", "true");
      shell.style.visibility = "hidden";
    } else {
      shell.removeAttribute("inert");
      shell.removeAttribute("aria-hidden");
      shell.style.visibility = "";
    }
  }, [locked]);

  function stay() {
    lastActivity.current = Date.now();
    lastKeepAlive.current = Date.now();
    setWarning(false);
    void api.staffAuth.me().catch(() => undefined);
  }

  function signedOut(reason: "switch" | "ended") {
    store.setLocked(false);
    if (reason === "switch") {
      void api.staffAuth.logout().catch(() => undefined);
    }
    queryClient.clear();
    void navigate("/login", {
      replace: true,
      state: reason === "ended" ? { reason: "expired" } : undefined,
    });
  }

  return (
    <>
      <span ref={sentinel} hidden />
      <Dialog
        open={warning && !locked}
        onOpenChange={(open) => !open && stay()}
        title={t("lock.warning.title")}
        description={t("lock.warning.body", { seconds: WARNING_SECONDS })}
        closeLabel={t("lock.close")}
        footer={
          <>
            <Button variant="secondary" onClick={lockNow}>
              {t("lock.lockNow")}
            </Button>
            <Button onClick={stay}>{t("lock.warning.stay")}</Button>
          </>
        }
      />
      {locked &&
        createPortal(
          <LockScreen
            onUnlocked={() => {
              lastActivity.current = Date.now();
              void queryClient.invalidateQueries({ queryKey: lockStateKey });
              store.setLocked(false);
            }}
            onSignedOut={signedOut}
          />,
          document.body,
        )}
    </>
  );
}
