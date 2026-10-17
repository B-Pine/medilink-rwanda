import { isApiError } from "@medilink/api-client";
import { Alert, Button, LoadingState } from "@medilink/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router";

import { useServices } from "../app/services";
import { useSetActiveFacility, useStaffMe } from "./queries";

/**
 * Route guard by session (GET /api/v1/staff/auth/me/):
 *  - 401 → login (keeps the requested path to return to)
 *  - signed in without an active facility → facility picker (several) or automatic choice (one)
 */
export function RequireStaff({ requireFacility = true }: { requireFacility?: boolean }) {
  const { t } = useTranslation();
  const { session } = useServices();
  const location = useLocation();
  const me = useStaffMe();
  const setActiveFacility = useSetActiveFacility();

  const user = me.data;
  const onlyMembership =
    user && !user.active_facility_id && user.memberships.length === 1 ? user.memberships[0] : null;
  const autoSelectId = requireFacility ? onlyMembership?.facility.id : undefined;
  const { mutate, isIdle } = setActiveFacility;

  useEffect(() => {
    if (autoSelectId && isIdle) mutate(autoSelectId);
  }, [autoSelectId, isIdle, mutate]);

  if (me.isPending) return <LoadingState className="min-h-dvh" />;

  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) {
      const reason = session.isExpired() ? "expired" : undefined;
      return <Navigate to="/login" replace state={{ from: location.pathname, reason }} />;
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

  if (requireFacility && !user!.active_facility_id && user!.memberships.length > 0) {
    if (user!.memberships.length > 1) {
      return <Navigate to="/select-facility" replace state={{ from: location.pathname }} />;
    }
    if (setActiveFacility.isError) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
          <Alert tone="danger" role="alert" title={t("facility.switchFailed")} />
          <Button variant="secondary" onClick={() => setActiveFacility.reset()}>
            {t("common.retry")}
          </Button>
        </main>
      );
    }
    return <LoadingState className="min-h-dvh" />;
  }

  return <Outlet />;
}
