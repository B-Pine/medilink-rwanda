import type { AppNotification } from "@medilink/api-client";
import {
  CountBadge,
  cx,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
} from "@medilink/ui";
import { Bell, BellRinging, Checks, Circle, ListBullets, Buildings } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import {
  notificationKeys,
  safeActionPath,
  useCountPollInterval,
  useNotificationSocket,
} from "./live";
import { useFormatWhen } from "./shared";
import { installAudioUnlock, playNotificationSound } from "./sound";

/** The unread count of the bell (shared with the inbox). */
export function useUnreadCount() {
  const api = useApi();
  const { data: me } = useStaffMe();
  const refetchInterval = useCountPollInterval();
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => api.notifications.staff.unreadCount(),
    enabled: Boolean(me),
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useStaffNotificationPreferences(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: () => api.notifications.staff.preferences(),
    enabled,
    staleTime: 60_000,
  });
}

export function useMarkRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.staff.markRead(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (before?: string) => api.notifications.staff.markAllRead(before),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

function BellItem({ item, onOpen }: { item: AppNotification; onOpen: () => void }) {
  const { t } = useTranslation();
  const when = useFormatWhen();
  return (
    <MenuItem onSelect={onOpen} className="items-start py-2">
      <span className="mt-1.5 inline-flex size-2.5 shrink-0 items-center justify-center">
        {!item.is_read && (
          <Circle aria-hidden="true" weight="fill" className="size-2.5 text-primary" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cx("truncate", item.is_read ? "text-fg-secondary" : "font-semibold")}>
          {!item.is_read && <span className="sr-only">{t("notifications.unreadMark")} </span>}
          {item.title}
        </span>
        <span className="line-clamp-2 text-body-sm text-fg-muted">{item.body}</span>
        <span className="text-caption text-fg-muted">
          {when(item.created_at)}
          {item.facility ? ` · ${item.facility.name}` : ""}
        </span>
      </span>
    </MenuItem>
  );
}

/**
 * Header bell (contract §6.1, design 04 §2): count badge (99+), the latest 10 with unread marked,
 * Mark all as read, See all and other facilities' unread count. Live through the socket, polling
 * every 60 s while it is down; new items are announced politely and, when the user turned it on,
 * a short tone plays.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { data: me } = useStaffMe();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const count = useUnreadCount();
  const prefs = useStaffNotificationPreferences(Boolean(me));
  const soundOn = Boolean(prefs.data?.sound_enabled);
  const latest = useQuery({
    queryKey: notificationKeys.latest,
    queryFn: () => api.notifications.staff.list({ page_size: 10 }),
    enabled: open,
  });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  useEffect(() => {
    installAudioUnlock();
  }, []);

  const onCreated = useCallback(() => {
    setAnnouncement((previous) =>
      previous === t("notifications.bell.newArrived")
        ? t("notifications.bell.newArrivedAgain")
        : t("notifications.bell.newArrived"),
    );
    if (soundOn) playNotificationSound();
  }, [soundOn, t]);
  useNotificationSocket(Boolean(me), onCreated);

  if (!me) return null;
  const unread = count.data?.unread ?? 0;
  const others = (count.data?.other_facilities ?? []).reduce((sum, o) => sum + o.unread, 0);
  const label =
    unread > 0
      ? t("notifications.bell.label", { count: unread })
      : t("notifications.bell.labelNone");
  const items = latest.data?.results ?? [];

  const openItem = (item: AppNotification) => {
    if (!item.is_read) markRead.mutate(item.id);
    void navigate(safeActionPath(item.action_path) ?? `/notifications/${item.id}`);
  };

  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger
          aria-label={label}
          className="relative inline-flex min-h-target min-w-target cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-subtle"
        >
          {unread > 0 ? (
            <BellRinging aria-hidden="true" className="size-icon" />
          ) : (
            <Bell aria-hidden="true" className="size-icon" />
          )}
          <CountBadge count={unread} className="absolute top-0.5 right-0.5" />
        </MenuTrigger>
        <MenuContent className="w-[min(24rem,calc(100vw-1rem))]">
          <MenuLabel className="flex items-center justify-between gap-2">
            <span>{t("notifications.bell.title")}</span>
            {unread > 0 && (
              <span className="font-normal">
                {t("notifications.bell.unread", { count: unread })}
              </span>
            )}
          </MenuLabel>
          {latest.isPending && (
            <div className="flex flex-col gap-2 px-3 py-2" aria-hidden="true">
              <Skeleton width="70%" />
              <Skeleton width="90%" />
              <Skeleton width="60%" />
            </div>
          )}
          {latest.isError && (
            <MenuItem
              onSelect={(event) => {
                event.preventDefault();
                void latest.refetch();
              }}
            >
              {t("notifications.bell.loadFailed")}
            </MenuItem>
          )}
          {latest.isSuccess && items.length === 0 && (
            <p className="m-0 px-3 py-4 text-body-sm text-fg-muted">
              {t("notifications.bell.empty")}
            </p>
          )}
          {items.map((item) => (
            <BellItem key={item.id} item={item} onOpen={() => openItem(item)} />
          ))}
          {others > 0 && (
            <>
              <MenuSeparator />
              <p className="m-0 flex items-center gap-2 px-3 py-2 text-body-sm text-fg-secondary">
                <Buildings aria-hidden="true" className="size-4" />
                {t("notifications.bell.otherFacilities", { count: others })}
              </p>
            </>
          )}
          <MenuSeparator />
          <MenuItem
            disabled={unread === 0}
            onSelect={(event) => {
              event.preventDefault();
              markAll.mutate(latest.data?.results[0]?.created_at);
            }}
          >
            <Checks aria-hidden="true" className="size-icon text-fg-muted" />
            {t("notifications.bell.markAll")}
          </MenuItem>
          <MenuItem onSelect={() => void navigate("/notifications")}>
            <ListBullets aria-hidden="true" className="size-icon text-fg-muted" />
            {t("notifications.bell.seeAll")}
          </MenuItem>
        </MenuContent>
      </Menu>
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
