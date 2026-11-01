import type { HistoryFilters, HistoryItem } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  SelectField,
  SidePanel,
  TextField,
} from "@medilink/ui";
import { ClockCounterClockwise, Heartbeat, LockKey, Notepad } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { AccessGate, AccessReasonPrompt } from "./AccessGate";
import {
  clinicalKeys,
  errorText,
  isReasonRequired,
  useAllergyItems,
  useCan,
  useVitalsLine,
  useWhen,
} from "./shared";

/** Problem summary (H2): allergies, conditions, current medicines, recent diagnoses. */
export function ProblemSummaryCard({ fpId }: { fpId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const allergyItems = useAllergyItems();
  const headingId = useId();
  const summary = useQuery({
    queryKey: clinicalKeys.summary(fpId),
    queryFn: () => api.clinical.summary(fpId),
  });
  if (summary.isPending) return <LoadingState label={t("clinical.loading")} />;
  if (summary.isError)
    return isReasonRequired(summary.error) ? (
      <AccessReasonPrompt fpId={fpId} />
    ) : (
      <Alert tone="danger" role="alert">
        {errorText(summary.error, t("errors.generic"))}
      </Alert>
    );
  const s = summary.data;
  const list = (items: { id: string; display: string; detail: string | null }[]) =>
    items.length ? (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((i) => (
          <li key={i.id}>
            {i.display}
            {i.detail && <span className="text-fg-muted"> · {i.detail}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="m-0 text-fg-muted">{t("clinical.summary.none")}</p>
    );
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 id={headingId} className="m-0 text-h4">
        {t("clinical.summary.title")}
      </h3>
      {s.is_staff_member && <Alert tone="warning">{t("clinical.summary.staffMember")}</Alert>}
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-semibold">{t("clinical.summary.allergies")}</dt>
          <dd className="m-0">
            {s.allergies.length ? (
              allergyItems(s.allergies).map((a) => (
                <p key={a.id} className="m-0">
                  <span className="font-semibold text-danger">{a.substance}</span>
                  {a.detail && <span className="text-fg-muted"> · {a.detail}</span>}
                </p>
              ))
            ) : (
              <p className="m-0 text-fg-muted">
                {s.no_known_allergies ? t("clinical.allergy.none") : t("clinical.allergy.unknown")}
              </p>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("clinical.summary.conditions")}</dt>
          <dd className="m-0">{list(s.conditions)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("clinical.summary.medications")}</dt>
          <dd className="m-0">{list(s.medications)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("clinical.summary.recentDiagnoses")}</dt>
          <dd className="m-0">
            {s.recent_diagnoses.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {s.recent_diagnoses.map((d) => (
                  <li key={d.code}>
                    <span className="font-mono">{d.code}</span> {d.display}
                    <span className="text-fg-muted"> · {when.date(d.last_seen_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-fg-muted">{t("clinical.summary.none")}</p>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function HistoryEntry({ item }: { item: HistoryItem }) {
  const { t, i18n } = useTranslation();
  const when = useWhen();
  const line = useVitalsLine();
  const lang = (i18n.resolvedLanguage ?? "rw") as "rw" | "en" | "fr";
  const service = item.service_name_i18n[lang] ?? item.service_name_i18n.en ?? "";
  const Icon = item.kind === "vitals" ? Heartbeat : Notepad;
  return (
    <li className="relative flex gap-3 border-s-2 border-border ps-4 pb-4">
      <Icon aria-hidden="true" weight="bold" className="mt-1 size-icon shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 text-body-sm text-fg-muted">
          <time dateTime={item.occurred_at}>{when.dateTime(item.occurred_at)}</time> · {service}
          {item.author_name ? ` · ${item.author_name}` : ""}
        </p>
        {item.kind === "consultation" ? (
          <>
            <p className="m-0 font-semibold">
              {item.diagnoses.length
                ? item.diagnoses
                    .map(
                      (d) => `${d.code} ${d.display} (${t(`clinical.diagnosis.${d.certainty}`)})`,
                    )
                    .join("; ")
                : t("clinical.history.noDiagnosis")}
            </p>
            <span className="flex flex-wrap gap-2">
              {item.status === "draft" && (
                <Badge tone="warning">{t("clinical.status.draft")}</Badge>
              )}
              {item.is_restricted && (
                <Badge tone="warning" icon={LockKey}>
                  {t("clinical.restricted.badge")}
                </Badge>
              )}
              {item.is_late_entry && <Badge tone="info">{t("clinical.lateEntry")}</Badge>}
              {item.addenda_count > 0 && (
                <Badge tone="neutral">
                  {t("clinical.history.addenda", { count: item.addenda_count })}
                </Badge>
              )}
            </span>
            <Link
              to={`/clinical/consultations/${item.id}`}
              className="self-start font-semibold text-link"
            >
              {t("clinical.history.open")}
            </Link>
          </>
        ) : (
          item.vitals && <p className="m-0 tabular-nums">{line(item.vitals)}</p>
        )}
      </div>
    </li>
  );
}

/** Timeline (H1) with filters by type, diagnosis code and dates, newest first. */
export function HistoryTimeline({ fpId }: { fpId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [page, setPage] = useState(1);
  const query = { ...filters, page };
  const history = useQuery({
    queryKey: clinicalKeys.history(fpId, query),
    queryFn: () => api.clinical.history(fpId, query),
  });
  const set = (patch: HistoryFilters) => {
    setPage(1);
    setFilters({ ...filters, ...patch });
  };
  if (history.isError && isReasonRequired(history.error)) return <AccessReasonPrompt fpId={fpId} />;
  return (
    <section aria-label={t("clinical.history.title")} className="flex flex-col gap-4">
      <div
        className="grid gap-3 sm:grid-cols-4"
        role="group"
        aria-label={t("clinical.history.filters")}
      >
        <SelectField
          label={t("clinical.history.type")}
          value={filters.type ?? ""}
          onChange={(e) => set({ type: e.target.value as HistoryFilters["type"] })}
        >
          <option value="">{t("clinical.history.all")}</option>
          <option value="consultation">{t("clinical.history.consultations")}</option>
          <option value="vitals">{t("clinical.history.vitals")}</option>
        </SelectField>
        <TextField
          label={t("clinical.history.code")}
          hint={t("clinical.history.codeHint")}
          value={filters.code ?? ""}
          onChange={(e) => set({ code: e.target.value.trim() })}
        />
        <TextField
          label={t("clinical.history.from")}
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => set({ from: e.target.value })}
        />
        <TextField
          label={t("clinical.history.to")}
          type="date"
          value={filters.to ?? ""}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      {history.isPending ? (
        <LoadingState label={t("clinical.loading")} />
      ) : history.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(history.error, t("errors.generic"))}
        </Alert>
      ) : history.data.results.length ? (
        <>
          <ol aria-label={t("clinical.history.items")} className="m-0 list-none p-0">
            {history.data.results.map((item) => (
              <HistoryEntry key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ol>
          {(history.data.next || history.data.previous) && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!history.data.previous}
                onClick={() => setPage(page - 1)}
              >
                {t("clinical.previous")}
              </Button>
              <Button
                variant="secondary"
                disabled={!history.data.next}
                onClick={() => setPage(page + 1)}
              >
                {t("clinical.next")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          size="inline"
          icon={ClockCounterClockwise}
          title={t("clinical.history.empty")}
        />
      )}
    </section>
  );
}

/** Timeline drawer next to the record (design 04 §3.2: compare while writing). */
export function HistoryDrawer({
  fpId,
  open,
  onOpenChange,
  patientName,
}: {
  fpId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
}) {
  const { t } = useTranslation();
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("clinical.history.drawerTitle", { name: patientName })}
      closeLabel={t("clinical.close")}
    >
      <div className="flex flex-col gap-5">
        <ProblemSummaryCard fpId={fpId} />
        <HistoryTimeline fpId={fpId} />
      </div>
    </SidePanel>
  );
}

/** /clinical/patients/:fpId/history: the same timeline as a page (from search or the record). */
export function HistoryPage() {
  const { t } = useTranslation();
  const { fpId = "" } = useParams();
  const allowed = useCan("clinical.view");
  if (!allowed) return <NotFoundContent />;
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={t("clinical.history.title")}
        back={{ to: `/patients/${fpId}`, label: t("clinical.history.backToRecord") }}
      />
      <AccessGate fpId={fpId}>
        <ProblemSummaryCard fpId={fpId} />
        <HistoryTimeline fpId={fpId} />
      </AccessGate>
    </div>
  );
}
