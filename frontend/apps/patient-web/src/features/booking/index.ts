import type { ComponentType } from "react";
import { redirect } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { NextVisitCard } from "./Upcoming";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S5 `booking`: search, facility profiles, the booking flow and upcoming bookings (contract §6.1). */
export const bookingFeature: FeatureRoutes = {
  public: [
    // upgrade 11 §5: Find care; older addresses keep working
    { path: "/find-care", lazy: lazy(() => import("./CarePage"), "CarePage") },
    {
      path: "/care",
      loader: ({ request }) => redirect(`/find-care${new URL(request.url).search}`),
    },
    {
      path: "/search",
      loader: ({ request }) => redirect(`/find-care${new URL(request.url).search}`),
    },
    { path: "/facilities/:slug", lazy: lazy(() => import("./FacilityPage"), "FacilityPage") },
  ],
  patient: [{ path: "/book/:slug", lazy: lazy(() => import("./BookPage"), "BookPage") }],
  homeMain: [NextVisitCard],
};
