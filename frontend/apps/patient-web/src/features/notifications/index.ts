import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";
import { NotificationMenu } from "./NotificationMenu";

/** For S5: mount after a booking ("tell me when to leave"); the overview shows the banner. */
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
    { path: paths.notifications, lazy: lazy(inbox, "InboxPage") },
    {
      path: paths.notificationSettings,
      lazy: lazy(() => import("./SettingsPage"), "SettingsPage"),
    },
    { path: `${paths.notifications}/:id`, lazy: lazy(inbox, "NotificationDetailPage") },
  ],
  // upgrade 12 §2B: the bell opens the latest items
  headerItems: [NotificationMenu],
};
