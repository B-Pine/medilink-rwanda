import { hasPermission } from "@medilink/api-client";
import { ClipboardText, Notepad } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

import { DoctorTodayCard } from "./DoctorToday";

const start = () => import("./StartPage");

/** S6a `clinical`: consultation, vitals, history and unsigned records (contract sprint-06 §6.1). */
export const clinicalFeature: FeatureRoutes = {
  shell: [
    { path: "/clinical/consultation", lazy: lazy(start, "StartPage") },
    { path: "/clinical/visits/:visitId/consultation", lazy: lazy(start, "OpenForVisitPage") },
    {
      path: "/clinical/consultations/:consultationId",
      lazy: lazy(() => import("./ConsultationPage"), "ConsultationPage"),
    },
    {
      path: "/clinical/patients/:fpId/history",
      lazy: lazy(() => import("./History"), "HistoryPage"),
    },
    { path: "/clinical/unsigned", lazy: lazy(() => import("./UnsignedPage"), "UnsignedPage") },
    { path: "/clinical/results", lazy: lazy(() => import("./ResultsPage"), "ResultsPage") },
    // upgrade 05 §3: doctor tools
    { path: "/clinical/questions", lazy: lazy(() => import("./QuestionsPage"), "QuestionsPage") },
    {
      path: "/clinical/follow-ups",
      lazy: lazy(() => import("./FollowUpsPage"), "FollowUpsPage"),
    },
    { path: "/clinical/activity", lazy: lazy(() => import("./ActivityPage"), "ActivityPage") },
    {
      path: "/clinical/templates",
      lazy: lazy(() => import("./TemplatesPage"), "TemplatesPage"),
    },
  ],
  // upgrade 05 §3: the doctor's day leads their Today page
  todayCards: [DoctorTodayCard],
  commands: [
    {
      actions: (me, t) => [
        ...(hasPermission(me, "clinical.write")
          ? [
              {
                id: "clinical:consultation",
                label: t("clinical.nav.consultation"),
                icon: Notepad,
                to: "/clinical/consultation",
              },
            ]
          : []),
        ...(hasPermission(me, "clinical.unsigned_list")
          ? [
              {
                id: "clinical:unsigned",
                label: t("clinical.nav.unsigned"),
                icon: ClipboardText,
                to: "/clinical/unsigned",
              },
            ]
          : []),
      ],
    },
  ],
};
