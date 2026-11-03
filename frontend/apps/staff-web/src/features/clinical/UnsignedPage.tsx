import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  cx,
  EmptyState,
  LoadingState,
  SwitchField,
} from "@medilink/ui";
import { CheckCircle, Signature, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { clinicalKeys, errorText, useCan, useWhen } from "./shared";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

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
    <div className="flex max-w-5xl flex-col gap-5">
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
          <div className="animate-enter overflow-x-auto rounded-2xl bg-surface shadow-card">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("clinical.unsigned.title")}</caption>
              <thead className="border-b border-border text-caption font-semibold tracking-wide text-fg-secondary uppercase">
                <tr>
                  {["patient", "author", "age", "action"].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cx("px-4 py-3 font-semibold", c === "action" && "text-right")}
                    >
                      {t(`clinical.unsigned.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.data.results.map((row) => (
                  <tr key={row.id} className="transition-colors duration-150 hover:bg-subtle/60">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-caption font-bold text-on-brand-subtle"
                        >
                          {initials(row.patient_display_name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold">{row.patient_display_name}</span>
                          <span className="text-caption text-fg-muted">
                            {t("clinical.unsigned.started", {
                              name: row.author.full_name,
                              time: when.dateTime(row.started_at),
                            })}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body-sm">{row.author.full_name}</td>
                    <td className="px-4 py-3">
                      {row.is_overdue ? (
                        <Badge tone="danger" icon={Warning}>
                          {t("clinical.unsigned.overdue")}
                        </Badge>
                      ) : (
                        <span className="text-body-sm text-fg-secondary tabular-nums">
                          {when.time(row.started_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canOpen && (
                        <Link
                          to={`/clinical/consultations/${row.id}?fp=${row.facility_patient_id}`}
                          aria-label={t("clinical.unsigned.open", {
                            name: row.patient_display_name,
                          })}
                          className={buttonClassName({ variant: "secondary", pill: true })}
                        >
                          <Signature aria-hidden="true" />
                          {t("clinical.unsigned.openShort")}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
