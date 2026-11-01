import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { NotificationBellLink } from "./NotificationBellLink";
import { PushOffBanner } from "./PushOptIn";

/** For S5: mount after a booking ("tell me when to leave"). */
export { PushOffBanner, PushOptIn } from "./PushOptIn";
export { createFakePushClient, setPushClient } from "./pushClient";
export type { PushClient } from "./pushClient";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const inbox = () => import("./InboxPage");

/** S9 `notifications`: bell, inbox, detail, preferences and push opt-in (contract §6.2). */
export const notificationsFeature: FeatureRoutes = {
  patient: [
    { path: "/notifications", lazy: lazy(inbox, "InboxPage") },
    {
      path: "/notifications/settings",
      lazy: lazy(() => import("./SettingsPage"), "SettingsPage"),
    },
    { path: "/notifications/:id", lazy: lazy(inbox, "NotificationDetailPage") },
  ],
  headerItems: [NotificationBellLink],
  // Under the main content: a live ticket must lead the home page (design 07 §3.1)
  homeMain: [PushOffBanner],
};
