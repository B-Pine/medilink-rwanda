import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { NextVisitCard } from "./Upcoming";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S5 `booking`: search, facility profiles, the booking flow and upcoming bookings (contract §6.1). */
export const bookingFeature: FeatureRoutes = {
  public: [
    { path: "/search", lazy: lazy(() => import("./SearchPage"), "SearchPage") },
    { path: "/facilities/:slug", lazy: lazy(() => import("./FacilityPage"), "FacilityPage") },
  ],
  patient: [{ path: "/book/:slug", lazy: lazy(() => import("./BookPage"), "BookPage") }],
  homeMain: [NextVisitCard],
};
