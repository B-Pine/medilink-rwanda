import { Buildings } from "@phosphor-icons/react";
import { Alert, Badge, Button, Card, Logo, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";

import { HOME_PATH, safeReturnPath } from "../auth/destination";
import { useSetActiveFacility, useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { facilityTypeLabel, roleLabel } from "../facility/labels";
import { describeApiError } from "../forms/api-errors";

/** Facility picker for staff with several memberships (design 05 §2): one card per facility. */
export function FacilityPickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useStaffMe();
  const setActiveFacility = useSetActiveFacility();
  const [choosing, setChoosing] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from;

  const user = me.data;
  if (!user) return null; // RequireStaff renders the loading and error states.
  if (user.memberships.length <= 1) return <Navigate to={HOME_PATH} replace />;

  const choose = (facilityId: string) => {
    setChoosing(facilityId);
    setActiveFacility.mutate(facilityId, {
      onSuccess: () => void navigate(safeReturnPath(from) ?? HOME_PATH, { replace: true }),
      onSettled: () => setChoosing(null),
    });
  };

  const title = t("facility.title");
  return (
    <div className="min-h-dvh bg-page">
      <SkipLink />
      <header className="border-b border-border bg-surface px-4 py-3 sm:px-8">
        <Logo className="h-9" />
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8"
      >
        <div className="flex flex-col gap-2">
          <PageHeading title={title}>{title}</PageHeading>
          <p className="m-0 max-w-2xl text-fg-secondary">{t("facility.intro")}</p>
        </div>
        {setActiveFacility.isError && (
          <Alert tone="danger" role="alert" title={t("facility.switchFailed")}>
            {describeApiError(setActiveFacility.error, t)}
          </Alert>
        )}
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {user.memberships.map(({ facility, roles }) => {
            const isCurrent = facility.id === user.active_facility_id;
            return (
              <li key={facility.id}>
                <Card
                  as="article"
                  aria-labelledby={`facility-${facility.id}`}
                  className="flex h-full flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-on-brand-subtle">
                      <Buildings aria-hidden="true" className="size-6" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <h2 id={`facility-${facility.id}`} className="m-0 text-h3">
                        {facility.name}
                      </h2>
                      <p className="m-0 text-body-sm text-fg-muted">
                        {facilityTypeLabel(facility.facility_type, t)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="m-0 text-body-sm font-semibold text-fg-secondary">
                      {t("facility.rolesLabel")}
                    </p>
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                      {roles.map((role) => (
                        <li key={role}>
                          <Badge tone="neutral">{roleLabel(role, t)}</Badge>
                        </li>
                      ))}
                      {isCurrent && (
                        <li>
                          <Badge tone="brand">{t("facility.current")}</Badge>
                        </li>
                      )}
                    </ul>
                  </div>
                  <Button
                    className="mt-auto"
                    variant="secondary"
                    fullWidth
                    loading={choosing === facility.id}
                    onClick={() => choose(facility.id)}
                  >
                    {t("facility.choose", { name: facility.name })}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
