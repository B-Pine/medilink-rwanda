import { cx } from "@medilink/ui";
import { ArrowsClockwise, CloudSlash, Lightning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLiveState } from "./live";
import { useCan } from "./shared";

/**
 * "Live · updated 3 s ago" (design 04 §5); yellow "Reconnecting" when the socket is down or the
 * data is older than 30 s; offline shows the number of queued actions (FR-QUE-16).
 */
export function LiveBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { status, updatedAt, pending } = useLiveState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  const offline = status === "offline" || (typeof navigator !== "undefined" && !navigator.onLine);
  const stale = status !== "live" || seconds > 30;
  const Icon = offline ? CloudSlash : stale ? ArrowsClockwise : Lightning;
  const label = offline
    ? t("queue.live.offline", { count: pending })
    : stale && status !== "live"
      ? t("queue.live.reconnecting")
      : t("queue.live.live", { seconds: Math.min(seconds, 99) });
  return (
    <span
      role="status"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold",
        offline
          ? "bg-danger-bg text-danger"
          : stale && status !== "live"
            ? "bg-warning-bg text-warning"
            : "bg-success-bg text-success",
        className,
      )}
    >
      <Icon aria-hidden="true" weight="bold" className="size-3.5" />
      {label}
    </span>
  );
}

/** Header item: shown to queue staff only. */
export function QueueHeaderLive() {
  const allowed = useCan("queue.operate", "queue.call", "pharmacy.dispense");
  return allowed ? <LiveBadge className="hidden md:inline-flex" /> : null;
}
