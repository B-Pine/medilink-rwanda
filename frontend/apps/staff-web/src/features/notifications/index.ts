import { Bell, Megaphone } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { NotificationBell } from "./NotificationBell";

export { playNotificationSound, unlockAudio } from "./sound";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const inbox = () => import("./InboxPage");
const announcements = () => import("./AnnouncementsPages");

/** S9 `notifications`: bell, inbox, preferences, facility and platform announcements (§6.1). */
export const notificationsFeature: FeatureRoutes = {
  shell: [
    { path: "/notifications", lazy: lazy(inbox, "InboxPage") },
    {
      path: "/notifications/settings",
      lazy: lazy(() => import("./SettingsPage"), "SettingsPage"),
    },
    { path: "/notifications/:id", lazy: lazy(inbox, "NotificationDetailPage") },
    { path: "/announcements", lazy: lazy(announcements, "FacilityAnnouncementsPage") },
    { path: "/announcements/new", lazy: lazy(announcements, "FacilityAnnouncementPage") },
    { path: "/announcements/:id", lazy: lazy(announcements, "FacilityAnnouncementPage") },
    { path: "/platform/announcements", lazy: lazy(announcements, "PlatformAnnouncementsPage") },
    { path: "/platform/announcements/new", lazy: lazy(announcements, "PlatformAnnouncementPage") },
    { path: "/platform/announcements/:id", lazy: lazy(announcements, "PlatformAnnouncementPage") },
  ],
  headerItems: [NotificationBell],
  commands: [
    {
      actions: (me, t) => [
        {
          id: "notifications:inbox",
          label: t("notifications.inbox.title"),
          icon: Bell,
          to: "/notifications",
        },
        ...(me.permissions.includes("announcements.manage")
          ? [
              {
                id: "notifications:announce",
                label: t("notifications.announcements.new"),
                icon: Megaphone,
                to: "/announcements/new",
              },
            ]
          : []),
      ],
    },
  ],
};
