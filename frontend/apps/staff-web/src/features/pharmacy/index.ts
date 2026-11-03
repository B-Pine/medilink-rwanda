import { hasPermission } from "@medilink/api-client";
import { Pill, Storefront } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

export { PrescriptionSection } from "./PrescriptionSection";
import { PharmacistTodayCard } from "./DeskPages";

/** S7a `pharmacy`: queue, dispensing, availability and labels (contract sprint-07 §6.1). */
export const pharmacyFeature: FeatureRoutes = {
  shell: [
    { path: "/pharmacy", lazy: lazy(() => import("./QueuePage"), "QueuePage") },
    {
      path: "/pharmacy/prescriptions/:prescriptionId",
      lazy: lazy(() => import("./DispensePage"), "DispensePage"),
    },
    {
      path: "/pharmacy/prescriptions/:prescriptionId/labels",
      lazy: lazy(() => import("./LabelsPage"), "LabelsPage"),
    },
    {
      path: "/pharmacy/availability",
      lazy: lazy(() => import("./AvailabilityPage"), "AvailabilityPage"),
    },
    // upgrade 05 §4: dispensing history and outside prescriptions
    {
      path: "/pharmacy/history",
      lazy: lazy(() => import("./DeskPages"), "DispenseHistoryPage"),
    },
    {
      path: "/pharmacy/verify",
      lazy: lazy(() => import("./DeskPages"), "VerifyPrescriptionPage"),
    },
  ],
  todayCards: [PharmacistTodayCard],
  commands: [
    {
      actions: (me, t) => [
        ...(hasPermission(me, "pharmacy.dispense")
          ? [{ id: "pharmacy:queue", label: t("shell.nav.pharmacy"), icon: Pill, to: "/pharmacy" }]
          : []),
        ...(hasPermission(me, "pharmacy.availability")
          ? [
              {
                id: "pharmacy:availability",
                label: t("pharmacy.nav.availability"),
                icon: Storefront,
                to: "/pharmacy/availability",
              },
            ]
          : []),
      ],
    },
  ],
};
