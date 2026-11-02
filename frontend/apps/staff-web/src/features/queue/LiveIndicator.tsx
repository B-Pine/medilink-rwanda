import { cx } from "@medilink/ui";
import { ArrowsClockwise, CloudSlash, Lightning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLiveState, useQueueSocket } from "./live";
import { useCan } from "./shared";

/** Data older than this shows the yellow "Reconnecting" chip (design 04 §5). */
export const STALE_AFTER_SECONDS = 30;

/**
 * "Live · updated 3 s ago" (design 04 §5); yellow "Reconnecting" when the socket is down or the
 * data is older than 30 s; offline shows the number of queued actions (FR-QUE-16).
 *
 * The visible chip ticks every 5 s, so it is not a live region: a separate status region announces
 * only changes of state (live, reconnecting, offline and its queued count), never the seconds.
 * Only one badge per screen announces (`announce`): the header one, shown on every staff page.
 */
export function LiveBadge({
  className,
  announce = false,
}: {
  className?: string;
  announce?: boolean;
}) {
  const { t } = useTranslation();
  const { status, updatedAt, pending } = useLiveState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  const offline = status === "offline" || (typeof navigator !== "undefined" && !navigator.onLine);
  const stale = !offline && (status !== "live" || seconds > STALE_AFTER_SECONDS);
  const Icon = offline ? CloudSlash : stale ? ArrowsClockwise : Lightning;
  const state = offline
    ? t("queue.live.offline", { count: pending })
    : stale
      ? t("queue.live.reconnecting")
      : t("queue.live.connected");
  const label = offline || stale ? state : t("queue.live.live", { seconds: Math.min(seconds, 99) });
  return (
    <>
      <span
        data-state={offline ? "offline" : stale ? "stale" : "live"}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold",
          offline
            ? "bg-danger-bg text-danger"
            : stale
              ? "bg-warning-bg text-warning"
              : "bg-success-bg text-success",
          className,
        )}
      >
        <Icon aria-hidden="true" weight="bold" className="size-3.5" />
        {label}
      </span>
      {announce && (
        <span role="status" className="sr-only">
          {state}
        </span>
      )}
    </>
  );
}

/** Header item: shown to queue staff only; keeps the shared queue socket open on every page. */
export function QueueHeaderLive() {
  const allowed = useCan("queue.operate", "queue.call", "pharmacy.dispense");
  useQueueSocket(allowed);
  return allowed ? <LiveBadge className="hidden md:inline-flex" announce /> : null;
}
