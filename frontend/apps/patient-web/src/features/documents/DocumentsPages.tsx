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
  Card,
  EmptyState,
  SelectField,
  Skeleton,
  type BadgeTone,
} from "@medilink/ui";
import {
  ArrowLeft,
  CaretRight,
  Copy,
  DownloadSimple,
  FileText,
  FolderSimple,
  LinkSimple,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
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
  const rows = list.data?.results ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <PageHeading title={t("documents.title")}>{t("documents.title")}</PageHeading>
      <p className="m-0 text-fg-secondary">{t("documents.intro")}</p>
      <div className="flex flex-wrap items-end gap-3">
        {people.length > 1 && (
          <SelectField
            label={t("documents.whose")}
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="min-w-56 flex-1"
          >
            <option value="">{t("documents.everyone")}</option>
            {people.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.display_name}
              </option>
            ))}
          </SelectField>
        )}
        {rows.length > 0 && (
          <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate()}>
            <FolderSimple aria-hidden="true" className="size-icon" />
            {t("documents.downloadAll")}
          </Button>
        )}
      </div>
      {archive.isError && (
        <Alert tone="danger" role="alert">
          {t("documents.failed")}
        </Alert>
      )}
      {list.isPending ? (
        <Skeleton height="5rem" className="rounded-lg" />
      ) : list.isError ? (
        <Alert tone="danger">{t("documents.failed")}</Alert>
      ) : rows.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.id}>
              <DocumentCard
                row={row}
                who={people.length > 1 ? nameOf(row.patient_id) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FileText}
          title={t("documents.empty")}
          description={t("documents.emptyBody")}
        />
      )}
    </div>
  );
}

function DocumentCard({ row, who }: { row: DocumentRow; who?: string | undefined }) {
  const { t } = useTranslation();
  const date = useDate();
  return (
    <Link
      to={`/documents/${row.id}`}
      className="flex items-center gap-4 rounded-xl bg-surface p-4 text-fg no-underline shadow-card hover:shadow-raised"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
        <FileText aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t(`documents.kind.${row.kind}`)}</span>
          {row.status !== "active" && (
            <Badge tone={STATUS_TONE[row.status]}>{t(`documents.status.${row.status}`)}</Badge>
          )}
        </span>
        <span className="text-body-sm text-fg-muted">
          {[who, row.facility_name, date(row.document_date)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <CaretRight aria-hidden="true" className="size-icon text-fg-muted" />
    </Link>
  );
}

/** /documents/:id (S7-F7): download, the verification code, and share links. */
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
  const live = doc.data?.share_links.filter(
    (l) => !l.revoked_at && Date.parse(l.expires_at) > openedAt,
  );
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <Link to="/documents" className="inline-flex items-center gap-2 self-start font-semibold">
        <ArrowLeft aria-hidden="true" className="size-icon" />
        {t("documents.back")}
      </Link>
      {doc.isPending ? (
        <Skeleton height="10rem" className="rounded-lg" />
      ) : doc.isError ? (
        <Alert tone="danger">{t("documents.notFound")}</Alert>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageHeading title={t(`documents.kind.${doc.data.kind}`)}>
              {t(`documents.kind.${doc.data.kind satisfies ClinicalDocumentKind}`)}
            </PageHeading>
            <p className="m-0 flex flex-wrap items-center gap-2 text-fg-secondary">
              <Badge tone={STATUS_TONE[doc.data.status]}>
                {t(`documents.status.${doc.data.status}`)}
              </Badge>
              <span>
                {doc.data.facility_name} · {t("documents.by", { name: doc.data.author_name })} ·{" "}
                {date(doc.data.document_date)}
              </span>
            </p>
          </div>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
                {t("documents.codeLabel")}
              </span>
              <span className="font-mono text-h2 font-bold tracking-wider">
                {doc.data.verification_code}
              </span>
              <span className="text-body-sm text-fg-muted">
                {t("documents.codeHint", { number: doc.data.number })}
              </span>
            </div>
            <Button
              className="self-start"
              disabled={doc.data.version_no === 0}
              loading={download.isPending}
              onClick={() => download.mutate()}
            >
              <DownloadSimple aria-hidden="true" className="size-icon" />
              {doc.data.version_no === 0 ? t("documents.preparing") : t("documents.download")}
            </Button>
            {doc.data.versions.length > 1 && (
              <p className="m-0 text-body-sm text-fg-muted">
                {t("documents.newVersion", { n: doc.data.version_no })}
              </p>
            )}
            {download.isError && (
              <Alert tone="danger" role="alert">
                {t("documents.failed")}
              </Alert>
            )}
          </Card>

          <section aria-labelledby="share-title" className="flex flex-col gap-3">
            <h2 id="share-title" className="m-0 flex items-center gap-2 text-h3">
              <LinkSimple aria-hidden="true" weight="duotone" className="size-6 text-brand" />
              {t("documents.share.title")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("documents.share.intro")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <SelectField
                label={t("documents.share.lasts")}
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-48"
              >
                {SHARE_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {t("documents.share.days", { count: d })}
                  </option>
                ))}
              </SelectField>
              <Button variant="secondary" loading={share.isPending} onClick={() => share.mutate()}>
                {t("documents.share.make")}
              </Button>
            </div>
            {made && (
              <Card className="flex flex-col gap-2" role="status">
                <span className="font-semibold">{t("documents.share.made")}</span>
                <span className="break-all font-mono text-body-sm select-all">{made.url}</span>
                <span className="text-body-sm text-fg-muted">{t("documents.share.once")}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => void copy(made.url)}
                >
                  <Copy aria-hidden="true" className="size-icon" />
                  {copied ? t("documents.share.copied") : t("documents.share.copy")}
                </Button>
              </Card>
            )}
            {(share.isError || revoke.isError) && (
              <Alert tone="danger" role="alert">
                {t("documents.failed")}
              </Alert>
            )}
            {live && live.length > 0 && (
              <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg bg-surface px-4 shadow-card">
                {live.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">
                        {t("documents.share.until", { date: date(l.expires_at, true) })}
                      </span>
                      <span className="text-body-sm text-fg-muted">
                        {t("documents.share.opened", { count: l.access_count })}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={revoke.isPending && revoke.variables === l.id}
                      onClick={() => revoke.mutate(l.id)}
                    >
                      {t("documents.share.revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
