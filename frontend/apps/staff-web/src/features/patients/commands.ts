import { hasPermission } from "@medilink/api-client";
import { detectSearchType } from "@medilink/ui";
import { UserCircle, UserPlus } from "@phosphor-icons/react";

import type { CommandProvider } from "../../layout/commands";

/** Command palette entries of `patients`: new walk-in, and find a patient by any identifier. */
export const patientCommands: CommandProvider = {
  actions: (me, t) =>
    hasPermission(me, "patient.register")
      ? [
          {
            id: "patients:register",
            label: t("patients.search.register"),
            icon: UserPlus,
            to: "/patients/register",
          },
        ]
      : [],
  search: {
    id: "patients",
    visible: (me) => hasPermission(me, "patients.view"),
    minLength: 2,
    label: (query, t) => t("patients.palette.searchFor", { query }),
    heading: (t) => t("patients.palette.results"),
    run: async (api, query, t) => {
      const { results } = await api.patients.search({ query, by: detectSearchType(query) });
      return results.map((patient) => ({
        id: `patient:${patient.facility_patient_id}`,
        label: patient.full_name,
        description: [
          patient.medilink_number,
          patient.file_number && t("patients.palette.file", { number: patient.file_number }),
          patient.age_years !== null && t("patients.age", { count: patient.age_years }),
        ]
          .filter(Boolean)
          .join(" · "),
        icon: UserCircle,
        to: `/patients/${patient.facility_patient_id}`,
      }));
    },
  },
};
