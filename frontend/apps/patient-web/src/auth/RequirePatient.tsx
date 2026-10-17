import { isApiError } from "@medilink/api-client";
import { Alert, Button, LoadingState } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router";

import { usePatientMe } from "./queries";

/** Route guard for the patient app (GET /api/v1/patient/auth/me/). Public pages never need it. */
export function RequirePatient() {
  const { t } = useTranslation();
  const location = useLocation();
  const me = usePatientMe();

  if (me.isPending) return <LoadingState className="min-h-dvh" />;
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
        <Alert tone="danger" role="alert" title={t("errors.loadFailed")}>
          {isApiError(me.error) && me.error.code === "network_error"
            ? t("errors.network")
            : t("errors.generic")}
        </Alert>
        <Button variant="secondary" onClick={() => void me.refetch()}>
          {t("common.retry")}
        </Button>
      </main>
    );
  }
  return <Outlet />;
}
