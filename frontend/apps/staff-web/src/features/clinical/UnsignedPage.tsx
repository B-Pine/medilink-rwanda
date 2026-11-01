import { Alert, Badge, Button, EmptyState, LoadingState, SwitchField } from "@medilink/ui";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { clinicalKeys, errorText, useCan, useWhen } from "./shared";

/**
 * /clinical/unsigned (FR-CLN-05, contract C7): drafts waiting for a signature. No clinical
 * content, so the facility admin can follow up too. Doctors see their own; an admin can switch.
 */
export function UnsignedPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const allowed = useCan("clinical.unsigned_list");
  const isAdmin = useCan("facility.configure");
  const canOpen = useCan("clinical.view");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const mine = !isAdmin || mineOnly;
  const list = useQuery({
    queryKey: [...clinicalKeys.unsigned(mine), page],
    queryFn: () => api.clinical.unsigned({ mine, page }),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={t("clinical.unsigned.title")}
        description={t("clinical.unsigned.description")}
      />
      {isAdmin && (
        <SwitchField
          label={t("clinical.unsigned.mineOnly")}
          checked={mineOnly}
          stateLabel={mineOnly ? t("clinical.restricted.on") : t("clinical.restricted.off")}
          onCheckedChange={(value) => {
            setPage(1);
            setMineOnly(value);
          }}
        />
      )}
      {list.isPending ? (
        <LoadingState label={t("clinical.loading")} />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : list.data.results.length ? (
        <>
          <ul
            aria-label={t("clinical.unsigned.title")}
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {list.data.results.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{row.patient_display_name}</span>
                  <span className="text-body-sm text-fg-muted">
                    {t("clinical.unsigned.started", {
                      name: row.author.full_name,
                      time: when.dateTime(row.started_at),
                    })}
                  </span>
                </div>
                {row.is_overdue && (
                  <Badge tone="danger" icon={Warning}>
                    {t("clinical.unsigned.overdue")}
                  </Badge>
                )}
                {canOpen && (
                  <Link
                    to={`/clinical/consultations/${row.id}?fp=${row.facility_patient_id}`}
                    className="font-semibold text-link"
                  >
                    {t("clinical.unsigned.open", { name: row.patient_display_name })}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {(list.data.next || list.data.previous) && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!list.data.previous}
                onClick={() => setPage(page - 1)}
              >
                {t("clinical.previous")}
              </Button>
              <Button
                variant="secondary"
                disabled={!list.data.next}
                onClick={() => setPage(page + 1)}
              >
                {t("clinical.next")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={CheckCircle}
          title={t("clinical.unsigned.empty")}
          description={t("clinical.unsigned.emptyBody")}
        />
      )}
    </div>
  );
}
