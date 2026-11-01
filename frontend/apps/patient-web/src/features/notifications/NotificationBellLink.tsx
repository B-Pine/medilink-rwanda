import { CountBadge } from "@medilink/ui";
import { Bell, BellRinging } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { usePatientMe } from "../../auth/queries";
import { usePushResync, useUnreadCount } from "./api";

/**
 * Header bell (design 07 §2): a 48 px link to /notifications with the unread count in its name
 * and a badge. Mounting it also re-syncs this browser's push subscription once per start.
 */
export function NotificationBellLink() {
  const { t } = useTranslation();
  const { data: me } = usePatientMe();
  const count = useUnreadCount();
  usePushResync(Boolean(me));
  const unread = count.data?.unread ?? 0;
  // Polite announcement when the count goes up (a new notification arrived).
  const previous = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (count.data === undefined) return;
    if (previous.current !== null && unread > previous.current)
      setAnnouncement(t("notifications.bell.newArrived", { count: unread }));
    previous.current = unread;
  }, [count.data, unread, t]);
  if (!me) return null;
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <Link
        to="/notifications"
        aria-label={
          unread > 0
            ? t("notifications.bell.label", { count: unread })
            : t("notifications.bell.labelNone")
        }
        className="relative inline-flex min-h-target min-w-target items-center justify-center rounded-full text-fg no-underline hover:bg-subtle"
      >
        {unread > 0 ? (
          <BellRinging aria-hidden="true" className="size-6" />
        ) : (
          <Bell aria-hidden="true" className="size-6" />
        )}
        <CountBadge count={unread} className="absolute top-1 right-1" />
      </Link>
    </>
  );
}
