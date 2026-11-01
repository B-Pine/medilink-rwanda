import { hasPermission } from "@medilink/api-client";
import { Phone } from "@phosphor-icons/react";
import { createElement, type ComponentType } from "react";
import { Navigate } from "react-router";

import type { FeatureRoutes } from "../../app/features";

export { FollowUpAction } from "./FollowUpAction";
export { PhoneBookingPanel, type PhoneBookingMode } from "./PhoneBookingPanel";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });
const disruptions = () => import("./DisruptionsPage");

/** Board URL that opens the phone booking panel (contract S5 §6.2: a side panel on the board). */
export const PHONE_BOOKING_URL = "/queue?book=new";

/** S5 `bookings`: phone booking at reception; S5b calendar and disruptions (contract §6.2). */
export const bookingsFeature: FeatureRoutes = {
  shell: [
    {
      path: "/bookings/new",
      element: createElement(Navigate, { to: PHONE_BOOKING_URL, replace: true }),
    },
    // S5b: /calendar replaces the shell's nav placeholder
    { path: "/calendar", lazy: lazy(() => import("./CalendarPage"), "CalendarPage") },
    { path: "/disruptions", lazy: lazy(disruptions, "DisruptionsPage") },
    { path: "/disruptions/:id", lazy: lazy(disruptions, "DisruptionPage") },
  ],
  commands: [
    {
      actions: (me, t) =>
        hasPermission(me, "queue.operate")
          ? [
              {
                id: "bookings:phone",
                label: t("bookings.phone.open"),
                icon: Phone,
                to: PHONE_BOOKING_URL,
              },
            ]
          : [],
    },
  ],
};
