import { hasPermission } from "@medilink/api-client";
import { Phone } from "@phosphor-icons/react";
import { createElement } from "react";
import { Navigate } from "react-router";

import type { FeatureRoutes } from "../../app/features";

export { PhoneBookingPanel, type PhoneBookingMode } from "./PhoneBookingPanel";

/** Board URL that opens the phone booking panel (contract S5 §6.2: a side panel on the board). */
export const PHONE_BOOKING_URL = "/queue?book=new";

/** S5 `bookings`: phone booking at reception (contract §6.2). */
export const bookingsFeature: FeatureRoutes = {
  shell: [
    {
      path: "/bookings/new",
      element: createElement(Navigate, { to: PHONE_BOOKING_URL, replace: true }),
    },
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
