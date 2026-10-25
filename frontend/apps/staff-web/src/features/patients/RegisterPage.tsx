import type { FacilityPatientDetail } from "@medilink/api-client";
import { Alert, Button } from "@medilink/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { PageHeader } from "../../components/PageHeader";
import { Gate } from "./shared";
import { WalkInForm } from "./WalkInForm";

/** /patients/register: walk-in registration; success shows the MediLink number. */
export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [done, setDone] = useState<FacilityPatientDetail | null>(null);
  return (
    <Gate codes={["patient.register"]}>
      <div className="flex max-w-6xl flex-col gap-5">
        <PageHeader
          title={t("patients.register.title")}
          back={{ to: "/patients", label: t("patients.search.title") }}
        />
        {done ? (
          <Alert
            tone="success"
            role="status"
            title={t("patients.register.done", { name: done.full_name })}
          >
            <p className="m-0">
              {t("patients.register.number")}{" "}
              <strong className="font-mono text-h3">{done.medilink_number}</strong>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void navigate(`/patients/${done.facility_patient_id}`)}>
                {t("patients.register.openRecord")}
              </Button>
              <Button variant="secondary" onClick={() => setDone(null)}>
                {t("patients.register.another")}
              </Button>
            </div>
          </Alert>
        ) : (
          <WalkInForm onRegistered={setDone} />
        )}
      </div>
    </Gate>
  );
}
