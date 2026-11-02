import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const appointments = () => import("./AppointmentsPages");

/**
 * Upgrade 12 `dashboard`: the signed-in patient dashboard's own pages (appointments) and the
 * shared surfaces every patient page uses (`kit.tsx`, `visits.tsx`, global search).
 */
export const dashboardFeature: FeatureRoutes = {
  patient: [
    { path: paths.appointments, lazy: lazy(appointments, "AppointmentsPage") },
    {
      path: `${paths.appointments}/:bookingId`,
      lazy: lazy(appointments, "AppointmentDetailPage"),
    },
    {
      path: paths.facilities,
      lazy: lazy(() => import("../site/DirectoryPages"), "FacilitiesPage"),
    },
  ],
};
