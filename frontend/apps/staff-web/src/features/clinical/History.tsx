import type { HistoryFilters, HistoryItem } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  EmptyState,
  LoadingState,
  SelectField,
  SidePanel,
  TextField,
} from "@medilink/ui";
import {
  Archive,
  CaretRight,
  ClockCounterClockwise,
  FileText,
  FirstAidKit,
  Heartbeat,
  LockKey,
  Notepad,
  Pill,
  Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
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
  const chips = (items: { id: string; display: string; detail: string | null }[]) =>
    items.length ? (
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {items.map((i) => (
          <li key={i.id} className="rounded-full bg-subtle px-2.5 py-1 text-body-sm">
            <span className="font-semibold">{i.display}</span>
            {i.detail && <span className="text-fg-secondary"> · {i.detail}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="m-0 text-body-sm text-fg-muted">{t("clinical.summary.none")}</p>
    );
  const box = "flex flex-col gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-border";
  const label = (icon: ReactNode, text: string) => (
    <dt className="flex items-center gap-2 text-caption font-semibold tracking-wide text-fg-secondary uppercase">
      {icon}
      {text}
    </dt>
  );
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl bg-subtle/60 p-4"
    >
      <h3 id={headingId} className="m-0 font-heading text-h3 tracking-tight">
        {t("clinical.summary.title")}
      </h3>
      {s.is_staff_member && <Alert tone="warning">{t("clinical.summary.staffMember")}</Alert>}
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <div className={cx(box, s.allergies.length > 0 && "bg-danger-bg/50 ring-danger/30")}>
          {label(
            <Warning aria-hidden="true" weight="bold" className="size-4 text-danger" />,
            t("clinical.summary.allergies"),
          )}
          <dd className="m-0">
            {s.allergies.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {allergyItems(s.allergies).map((a) => (
                  <li
                    key={a.id}
                    className="rounded-full bg-danger-bg px-2.5 py-1 text-body-sm text-danger"
                  >
                    <span className="font-semibold">{a.substance}</span>
                    {a.detail && <span> · {a.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body-sm text-fg-muted">
                {s.no_known_allergies ? t("clinical.allergy.none") : t("clinical.allergy.unknown")}
              </p>
            )}
          </dd>
        </div>
        <div className={box}>
          {label(
            <Heartbeat aria-hidden="true" weight="bold" className="size-4" />,
            t("clinical.summary.conditions"),
          )}
          <dd className="m-0">{chips(s.conditions)}</dd>
        </div>
        <div className={box}>
          {label(
            <Pill aria-hidden="true" weight="bold" className="size-4" />,
            t("clinical.summary.medications"),
          )}
          <dd className="m-0">{chips(s.medications)}</dd>
        </div>
        <div className={box}>
          {label(
            <FirstAidKit aria-hidden="true" weight="bold" className="size-4" />,
            t("clinical.summary.recentDiagnoses"),
          )}
          <dd className="m-0">
            {s.recent_diagnoses.length ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {s.recent_diagnoses.map((d) => (
                  <li key={d.code} className="flex flex-wrap items-center gap-2 text-body-sm">
                    <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono font-semibold">
                      {d.code}
                    </span>
                    <span className="font-semibold">{d.display}</span>
                    <span className="text-fg-muted tabular-nums">{when.date(d.last_seen_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body-sm text-fg-muted">{t("clinical.summary.none")}</p>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Paper records back-entered by staff and scanned documents (S6b L2, L3): always labelled. */
export function PaperRecordsCard({ fpId }: { fpId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const headingId = useId();
  const entries = useQuery({
    queryKey: ["clinical", "history-entries", fpId],
    queryFn: () => api.clinical.historyEntries(fpId),
  });
  const scans = useQuery({
    queryKey: ["clinical", "scans", fpId],
    queryFn: () => api.clinical.scans(fpId),
  });
  const open = useMutation({
    mutationFn: (id: string) => api.clinical.scanLink(id),
    onSuccess: (link) => window.open(link.url, "_blank", "noopener,noreferrer"),
  });
  if (entries.isError || scans.isError) return null;
  const rows = entries.data ?? [];
  const files = scans.data ?? [];
  if (!entries.isPending && !scans.isPending && rows.length === 0 && files.length === 0)
    return null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl bg-subtle/60 p-4"
    >
      <h3
        id={headingId}
        className="m-0 flex items-center gap-2 font-heading text-h3 tracking-tight"
      >
        <Archive aria-hidden="true" weight="bold" className="size-5 text-fg-secondary" />
        {t("clinical.paper.title")}
      </h3>
      {rows.length > 0 && (
        <ul
          aria-label={t("clinical.paper.entries")}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {rows.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-1 rounded-xl bg-surface p-3 ring-1 ring-border"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{t(`clinical.paper.kind.${e.kind}`)}</Badge>
                {e.code && (
                  <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-body-sm font-semibold">
                    {e.code}
                  </span>
                )}
                <span className="font-semibold">{e.display}</span>
                <Badge tone="info">{t("clinical.paper.historical")}</Badge>
              </span>
              {e.note && <span className="text-body-sm text-fg-secondary">{e.note}</span>}
              <span className="text-caption text-fg-muted tabular-nums">
                {e.occurred_on ? `${when.date(e.occurred_on)} · ` : ""}
                {t("clinical.paper.enteredBy", { name: e.entered_by_name })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul
          aria-label={t("clinical.paper.scans")}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {files.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-border"
            >
              <FileText
                aria-hidden="true"
                weight="bold"
                className="size-5 shrink-0 text-fg-secondary"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm font-semibold">
                  {f.description || t(`clinical.paper.type.${f.document_type}`)}
                </span>
                <span className="text-caption text-fg-muted tabular-nums">
                  {t(`clinical.paper.type.${f.document_type}`)} · {when.date(f.document_date)}
                </span>
              </span>
              <Button
                variant="ghost"
                pill
                loading={open.isPending && open.variables === f.id}
                onClick={() => open.mutate(f.id)}
                aria-label={`${t("clinical.paper.view")}: ${f.description}`}
              >
                {t("clinical.paper.view")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryEntry({ item }: { item: HistoryItem }) {
  const { t, i18n } = useTranslation();
  const when = useWhen();
  const line = useVitalsLine();
  const lang = (i18n.resolvedLanguage ?? "rw") as "rw" | "en" | "fr";
  const service = item.service_name_i18n[lang] ?? item.service_name_i18n.en ?? "";
  const KindIcon = item.kind === "vitals" ? Heartbeat : Notepad;
  return (
    <li className="relative flex gap-4 pb-4 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute top-10 bottom-0 left-[1.125rem] w-0.5 rounded-full bg-border"
      />
      <span
        aria-hidden="true"
        className={cx(
          "relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-page",
          item.kind === "vitals"
            ? "bg-subtle text-fg-secondary"
            : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        <KindIcon weight="bold" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-surface p-3.5 shadow-card">
        <p className="m-0 text-caption text-fg-muted">
          <time
            dateTime={item.occurred_at}
            className="font-semibold text-fg-secondary tabular-nums"
          >
            {when.dateTime(item.occurred_at)}
          </time>{" "}
          · {service}
          {item.author_name ? ` · ${item.author_name}` : ""}
        </p>
        {item.kind === "consultation" ? (
          <>
            {item.diagnoses.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {item.diagnoses.map((d) => (
                  <li
                    key={d.code}
                    className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-body-sm"
                  >
                    <span className="font-mono font-semibold">{d.code}</span>
                    <span className="font-semibold">{d.display}</span>
                    <span className="text-fg-secondary">
                      ({t(`clinical.diagnosis.${d.certainty}`)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 font-semibold">{t("clinical.history.noDiagnosis")}</p>
            )}
            <span className="flex flex-wrap items-center gap-2">
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
              <Link
                to={`/clinical/consultations/${item.id}`}
                className="ms-auto inline-flex items-center gap-1 text-body-sm font-semibold text-link"
              >
                {t("clinical.history.open")}
                <CaretRight aria-hidden="true" weight="bold" className="size-3.5" />
              </Link>
            </span>
          </>
        ) : (
          item.vitals && <p className="m-0 text-body-sm tabular-nums">{line(item.vitals)}</p>
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
          <ol aria-label={t("clinical.history.items")} className="ml-stagger m-0 list-none p-0">
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
        <PaperRecordsCard fpId={fpId} />
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
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={t("clinical.history.title")}
        back={{ to: `/patients/${fpId}`, label: t("clinical.history.backToRecord") }}
      />
      <AccessGate fpId={fpId}>
        <ProblemSummaryCard fpId={fpId} />
        <PaperRecordsCard fpId={fpId} />
        <HistoryTimeline fpId={fpId} />
      </AccessGate>
    </div>
  );
}
