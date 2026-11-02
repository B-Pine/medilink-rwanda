import { Bell, BellRinging, Checks } from "@phosphor-icons/react";
import {
  CountBadge,
  cx,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
} from "@medilink/ui";
import { formatDate, formatTime } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { usePatientMe } from "../../auth/queries";
import {
  notificationKeys,
  safeActionPath,
  useMarkAllRead,
  useMarkRead,
  usePushResync,
  useUnreadCount,
} from "./api";

const LATEST = { page_size: 5 } as const;

function when(iso: string, lang: string): string {
  const today = new Date().toDateString() === new Date(iso).toDateString();
  return today ? formatTime(iso, lang) : formatDate(iso, lang, { day: "numeric", month: "short" });
}

/**
 * Header bell (upgrade 12 §2B): the unread count on the button; opening it shows the five latest
 * items, "Mark all as read" and "View all". Choosing an item marks it read and opens what it is
 * about. Mounting it also re-syncs this browser's push subscription once per start.
 */
export function NotificationMenu() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const navigate = useNavigate();
  const { data: me } = usePatientMe();
  const count = useUnreadCount();
  usePushResync(Boolean(me));
  const [open, setOpen] = useState(false);
  const latest = useQuery({
    queryKey: notificationKeys.list(LATEST),
    queryFn: () => api.notifications.patient.list(LATEST),
    enabled: open,
  });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unread = count.data?.unread ?? 0;

  // Polite announcement when the count goes up (a new notification arrived)
  const previous = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (count.data === undefined) return;
    if (previous.current !== null && unread > previous.current)
      setAnnouncement(t("notifications.bell.newArrived", { count: unread }));
    previous.current = unread;
  }, [count.data, unread, t]);

  if (!me) return null;
  const items = latest.data?.results ?? [];
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger
          aria-label={
            unread > 0
              ? t("notifications.bell.label", { count: unread })
              : t("notifications.bell.labelNone")
          }
          className="relative inline-flex min-h-target min-w-target cursor-pointer items-center justify-center rounded-full text-fg transition-colors duration-150 hover:bg-subtle data-[state=open]:bg-subtle"
        >
          {unread > 0 ? (
            <BellRinging aria-hidden="true" className="size-6" />
          ) : (
            <Bell aria-hidden="true" className="size-6" />
          )}
          <CountBadge count={unread} className="absolute top-1 right-1" />
        </MenuTrigger>
        <MenuContent className="w-[22rem] p-0">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <p className="m-0 font-heading text-body font-bold">{t("dashboard.bell.title")}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate(undefined)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-body-sm font-semibold text-link hover:bg-subtle"
              >
                <Checks aria-hidden="true" className="size-4" />
                {t("dashboard.bell.markAll")}
              </button>
            )}
          </div>
          <MenuSeparator className="my-0" />
          <div className="max-h-[22rem] overflow-y-auto p-1">
            {latest.isPending ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton height="2.5rem" />
                <Skeleton height="2.5rem" />
              </div>
            ) : items.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-body-sm text-fg-muted">
                {latest.isError ? t("dashboard.bell.failed") : t("dashboard.bell.empty")}
              </p>
            ) : (
              items.map((item) => (
                <MenuItem
                  key={item.id}
                  onSelect={() => {
                    if (!item.is_read) markRead.mutate(item.id);
                    void navigate(safeActionPath(item.action_path) ?? paths.notification(item.id));
                  }}
                  className="items-start gap-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-2 size-2 shrink-0 rounded-full",
                      item.is_read ? "bg-transparent" : "bg-brand",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cx(
                        "truncate text-body-sm",
                        item.is_read ? "font-semibold" : "font-bold",
                      )}
                    >
                      {item.title}
                      {!item.is_read && (
                        <span className="sr-only"> ({t("dashboard.bell.unread")})</span>
                      )}
                    </span>
                    <span className="line-clamp-1 text-body-sm text-fg-secondary">{item.body}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-caption tabular-nums text-fg-muted">
                    {when(item.created_at, lang)}
                  </span>
                </MenuItem>
              ))
            )}
          </div>
          <MenuSeparator className="my-0" />
          <div className="p-1">
            <MenuItem
              onSelect={() => void navigate(paths.notifications)}
              className="justify-center font-semibold text-link"
            >
              {t("dashboard.bell.viewAll")}
            </MenuItem>
          </div>
        </MenuContent>
      </Menu>
    </>
  );
}
