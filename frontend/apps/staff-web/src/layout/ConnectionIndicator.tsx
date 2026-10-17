import { WifiHigh, WifiSlash } from "@phosphor-icons/react";
import { cx } from "@medilink/ui";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Connection indicator, never hidden (design 04 §2, FR-QUE-16). Sprint 0 placeholder: browser
 * online/offline only. Sprint 4 adds the live WebSocket state (Reconnecting, queued actions).
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const { t } = useTranslation();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const StatusIcon = online ? WifiHigh : WifiSlash;
  return (
    <p
      role="status"
      aria-label={t("shell.connection.label")}
      className={cx(
        "m-0 inline-flex items-center gap-2 rounded-full px-3 py-1 text-body-sm font-semibold",
        online ? "bg-success-bg text-success" : "bg-danger-bg text-danger",
        className,
      )}
    >
      <StatusIcon aria-hidden="true" weight="bold" className="size-4" />
      {online ? t("shell.connection.online") : t("shell.connection.offline")}
    </p>
  );
}
