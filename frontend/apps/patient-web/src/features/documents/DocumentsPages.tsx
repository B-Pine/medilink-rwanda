import type {
  ClinicalDocumentKind,
  DocumentLink,
  DocumentRow,
  DocumentVerificationStatus,
  NewShareLink,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  SelectField,
  Skeleton,
  type BadgeTone,
} from "@medilink/ui";
import {
  Bed,
  Copy,
  DownloadSimple,
  FileText,
  FolderSimple,
  LinkSimple,
  Prescription,
  Signpost,
  TestTube,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import {
  ErrorBlock,
  PageHeader,
  RowIcon,
  RowLink,
  RowList,
  RowsSkeleton,
  SegmentedTabs,
  WidgetCard,
} from "../dashboard/kit";
import { useProfiles } from "../profile/ProfileLayout";
import { useDate } from "../records/RecordsPages";

export const documentsKeys = {
  list: (patientId: string) => ["documents", "list", patientId] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
};

export const STATUS_TONE: Record<DocumentVerificationStatus, BadgeTone> = {
  active: "success",
  dispensed: "info",
  cancelled: "neutral",
  expired: "neutral",
};

const SHARE_DAYS = [1, 7, 30] as const;

/**
 * Five-minute link served as an attachment (contract D2, D4): the browser downloads it and stays
 * on the page. `_self` is never blocked as a pop-up, even after the request's await.
 */
export function openFile(link: DocumentLink): void {
  window.open(link.url, "_self");
}

/** Each kind has its own icon, so the list can be scanned by shape as well as by word. */
const KIND_ICON: Record<ClinicalDocumentKind, Icon> = {
  prescription: Prescription,
  referral: Signpost,
  lab_request: TestTube,
  sick_note: Bed,
};

/** /documents (S7-F7, FR-DOC-06): my and my dependants' documents, newest first. */
export function DocumentsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const profiles = useProfiles();
  const [patientId, setPatientId] = useState("");
  const list = useQuery({
    queryKey: documentsKeys.list(patientId),
    queryFn: () => api.documents.patient.list(patientId ? { patient_id: patientId } : {}),
  });
  const archive = useMutation({
    mutationFn: () => api.documents.patient.archive(patientId || undefined),
    onSuccess: openFile,
  });
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) => people.find((p) => p.patient_id === id)?.display_name;
  const [kind, setKind] = useState<ClinicalDocumentKind | "all">("all");
  const all = list.data?.results ?? [];
  // Only the kinds this person actually has (upgrade 12 §12)
  const kinds = [...new Set(all.map((row) => row.kind))];
  const rows = kind === "all" ? all : all.filter((row) => row.kind === kind);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("documents.title")}
        actions={
          all.length > 0 && (
            <Button
              variant="secondary"
              loading={archive.isPending}
              onClick={() => archive.mutate()}
            >
              <FolderSimple aria-hidden="true" className="size-4" />
              {t("documents.downloadAll")}
            </Button>
          )
        }
      />
      {(kinds.length > 1 || people.length > 1) && (
        // one toolbar: the type switch and, for families, whose documents
        <div className="flex flex-wrap items-end justify-between gap-3">
          {kinds.length > 1 ? (
            <SegmentedTabs
              label={t("dashboard.documents.kinds")}
              value={kind}
              onChange={setKind}
              options={[
                { value: "all" as const, label: t("dashboard.documents.all") },
                ...kinds.map((k) => ({ value: k, label: t(`documents.kind.${k}`) })),
              ]}
            />
          ) : (
            <span />
          )}
          {people.length > 1 && (
            <SelectField
              label={t("documents.whose")}
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="sm:w-72"
            >
              <option value="">{t("documents.everyone")}</option>
              {people.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.display_name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
      )}
      {archive.isError && (
        <Alert tone="danger" role="alert">
          {t("documents.failed")}
        </Alert>
      )}
      {list.isPending ? (
        <RowsSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorBlock message={t("documents.failed")} onRetry={() => void list.refetch()} />
      ) : rows.length ? (
        <RowList label={t("documents.title")}>
          {rows.map((row) => (
            <DocumentListRow
              key={row.id}
              row={row}
              who={people.length > 1 ? nameOf(row.patient_id) : undefined}
            />
          ))}
        </RowList>
      ) : (
        <EmptyState icon={FileText} title={t("documents.empty")} />
      )}
    </div>
  );
}

function DocumentListRow({ row, who }: { row: DocumentRow; who?: string | undefined }) {
  const { t } = useTranslation();
  const date = useDate();
  return (
    <RowLink
      to={paths.document(row.id)}
      leading={<RowIcon icon={KIND_ICON[row.kind] ?? FileText} />}
      title={t(`documents.kind.${row.kind}`)}
      meta={[who, row.facility_name, date(row.document_date)].filter(Boolean).join(" · ")}
      trailing={<Badge tone={STATUS_TONE[row.status]}>{t(`documents.status.${row.status}`)}</Badge>}
    />
  );
}

/**
 * /documents/:id (S7-F7, redesign 2026-11-02): download in the header; the verification code on a
 * ticket and the share links in the main column; the document's facts beside.
 */
export function DocumentDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const queryClient = useQueryClient();
  const { documentId = "" } = useParams();
  const [days, setDays] = useState<number>(7);
  const [made, setMade] = useState<NewShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const doc = useQuery({
    queryKey: documentsKeys.detail(documentId),
    queryFn: () => api.documents.patient.get(documentId),
  });
  const download = useMutation({
    mutationFn: () => api.documents.patient.downloadLink(documentId),
    onSuccess: openFile,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: documentsKeys.detail(documentId) });
  const share = useMutation({
    mutationFn: () => api.documents.patient.share(documentId, days),
    onSuccess: async (link) => {
      setMade(link);
      setCopied(false);
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => api.documents.patient.revokeShare(documentId, linkId),
    onSuccess: refresh,
  });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const back = { to: paths.documents, label: t("documents.back") };
  if (doc.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton height="14rem" className="rounded-2xl" />
          <Skeleton height="12rem" className="rounded-2xl" />
        </div>
      </div>
    );
  if (doc.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("documents.notFound")} back={back} />
        <Alert tone="danger">{t("documents.notFound")}</Alert>
      </div>
    );
  const d = doc.data;
  const live = d.share_links.filter((l) => !l.revoked_at && Date.parse(l.expires_at) > openedAt);
  const KindIcon = KIND_ICON[d.kind] ?? FileText;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(`documents.kind.${d.kind satisfies ClinicalDocumentKind}`)}
        subtitle={`${d.facility_name} · ${t("documents.by", { name: d.author_name })} · ${date(d.document_date)}`}
        back={back}
        actions={
          <>
            <Badge tone={STATUS_TONE[d.status]}>{t(`documents.status.${d.status}`)}</Badge>
            <Button
              disabled={d.version_no === 0}
              loading={download.isPending}
              onClick={() => download.mutate()}
              className="shadow-card"
            >
              <DownloadSimple aria-hidden="true" weight="bold" className="size-4" />
              {d.version_no === 0 ? t("documents.preparing") : t("documents.download")}
            </Button>
          </>
        }
      />
      {download.isError && (
        <Alert tone="danger" role="alert">
          {t("documents.failed")}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* the code anyone can check at /verify, on the same ticket as prescriptions */}
          <div className="ml-ticket-stub flex flex-col items-center gap-1.5 rounded-2xl border border-brand/30 bg-brand-subtle px-5 py-7 text-center">
            <span className="text-caption font-semibold tracking-[0.14em] text-on-brand-subtle uppercase">
              {t("documents.codeLabel")}
            </span>
            <span className="font-mono text-h1 font-bold tracking-wider text-fg">
              {d.verification_code}
            </span>
            <span className="max-w-md text-body-sm text-fg-secondary">
              {t("documents.codeHint", { number: d.number })}
            </span>
          </div>

          <WidgetCard id="share-title" title={t("documents.share.title")}>
            <div className="flex flex-col gap-4 p-5">
              <p className="m-0 text-body-sm text-fg-secondary">{t("documents.share.intro")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <SelectField
                  label={t("documents.share.lasts")}
                  value={String(days)}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-48"
                >
                  {SHARE_DAYS.map((n) => (
                    <option key={n} value={n}>
                      {t("documents.share.days", { count: n })}
                    </option>
                  ))}
                </SelectField>
                <Button
                  variant="secondary"
                  loading={share.isPending}
                  onClick={() => share.mutate()}
                >
                  <LinkSimple aria-hidden="true" className="size-4" />
                  {t("documents.share.make")}
                </Button>
              </div>
              {made && (
                <div
                  role="status"
                  className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand-subtle/60 p-4"
                >
                  <span className="font-semibold">{t("documents.share.made")}</span>
                  <span className="font-mono text-body-sm break-all select-all">{made.url}</span>
                  <span className="text-body-sm text-fg-muted">{t("documents.share.once")}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => void copy(made.url)}
                  >
                    <Copy aria-hidden="true" className="size-4" />
                    {copied ? t("documents.share.copied") : t("documents.share.copy")}
                  </Button>
                </div>
              )}
              {(share.isError || revoke.isError) && (
                <Alert tone="danger" role="alert">
                  {t("documents.failed")}
                </Alert>
              )}
            </div>
            {live.length > 0 && (
              <ul className="m-0 flex list-none flex-col divide-y divide-border border-t border-border p-0">
                {live.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <RowIcon icon={LinkSimple} tone="neutral" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-sm font-semibold">
                        {t("documents.share.until", { date: date(l.expires_at, true) })}
                      </span>
                      <span className="text-caption text-fg-muted">
                        {t("documents.share.opened", { count: l.access_count })}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revoke.isPending && revoke.variables === l.id}
                      onClick={() => revoke.mutate(l.id)}
                      className="text-danger"
                    >
                      {t("documents.share.revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </WidgetCard>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <WidgetCard id="doc-about" title={t("documents.about")}>
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <RowIcon icon={KindIcon} />
              <span className="font-semibold text-fg">{t(`documents.kind.${d.kind}`)}</span>
            </div>
            <dl className="m-0 flex flex-col divide-y divide-border">
              {[
                [t("documents.facts.number"), d.number],
                [t("documents.facts.facility"), d.facility_name],
                [t("documents.facts.author"), d.author_name],
                [t("documents.facts.date"), date(d.document_date)],
                ...(d.versions.length > 1
                  ? [[t("documents.facts.version"), t("documents.newVersion", { n: d.version_no })]]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 px-5 py-3">
                  <dt className="text-caption font-semibold text-fg-muted">{label}</dt>
                  <dd className="m-0 text-body-sm font-semibold break-words text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </WidgetCard>
        </aside>
      </div>
    </div>
  );
}
