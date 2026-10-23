import type { ApplicationDocument, PlatformApplication } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DocumentViewer,
  LoadingState,
  SelectField,
  TextField,
  TextareaField,
  Timeline,
  type DocumentViewerLabels,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { useStepUp } from "../lock";
import {
  actionError,
  formatDate,
  PlatformOnly,
  StatusBadge,
  useIdempotencyKey,
  useLocale,
} from "./shared";

const key = (id: string) => ["platform", "application", id] as const;

export function ApplicationReviewPage() {
  return (
    <PlatformOnly>
      <Review />
    </PlatformOnly>
  );
}

export function useViewerLabels(): DocumentViewerLabels {
  const { t } = useTranslation();
  return {
    zoomIn: t("platform.viewer.zoomIn"),
    zoomOut: t("platform.viewer.zoomOut"),
    rotate: t("platform.viewer.rotate"),
    previousPage: t("platform.viewer.previousPage"),
    nextPage: t("platform.viewer.nextPage"),
    page: (page, pages) => t("platform.viewer.page", { page, pages }),
    download: t("platform.viewer.download"),
    loading: t("platform.viewer.loading"),
    error: t("platform.viewer.error"),
    retry: t("platform.table.retry"),
  };
}

function Review() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const app = useQuery({
    queryKey: key(id),
    queryFn: () => api.onboarding.platform.application(id),
  });
  const events = useQuery({
    queryKey: [...key(id), "events"],
    queryFn: () => api.onboarding.platform.events(id),
  });
  const [viewing, setViewing] = useState<ApplicationDocument | null>(null);
  const [dialog, setDialog] = useState<"changes" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const viewerLabels = useViewerLabels();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key(id) });
    void queryClient.invalidateQueries({ queryKey: ["platform", "applications"] });
  };

  const startReview = useMutation({
    mutationFn: (version: number) => api.onboarding.platform.startReview(id, version),
    onSuccess: refresh,
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const reviewDocument = useMutation({
    mutationFn: (args: { doc: string; verdict: "accepted" | "needs_change"; comment?: string }) =>
      api.onboarding.platform.reviewDocument(id, args.doc, args.verdict, args.comment ?? ""),
    onSuccess: refresh,
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });

  if (app.isPending) return <LoadingState />;
  if (app.isError) return <Alert tone="danger">{t("platform.table.error")}</Alert>;
  const data = app.data;
  const underReview = data.status === "under_review";
  const allAccepted =
    data.documents.length > 0 && data.documents.every((d) => d.review_status === "accepted");

  return (
    <div className="flex flex-col gap-6">
      <Link to="/platform/applications" className="text-link">
        {t("platform.applications.back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeading title={data.facility.name}>{data.facility.name}</PageHeading>
        <StatusBadge kind="application" value={data.status} />
      </div>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {data.duplicate_hints.length > 0 && (
        <Alert tone="warning" title={t("platform.review.duplicatesTitle")}>
          <ul className="m-0 pl-5">
            {data.duplicate_hints.map((hint, i) => (
              <li key={i}>
                {t(`platform.review.duplicate.${hint.kind}`)}{" "}
                {hint.application_id && (
                  <Link to={`/platform/applications/${hint.application_id}`}>
                    {t("platform.review.openOther")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {data.status === "submitted" && (
          <Button loading={startReview.isPending} onClick={() => startReview.mutate(data.version)}>
            {t("platform.review.start")}
          </Button>
        )}
        {underReview && (
          <>
            <Button variant="secondary" onClick={() => setDialog("changes")}>
              {t("platform.review.requestChanges")}
            </Button>
            <Button disabled={!allAccepted} onClick={() => setDialog("approve")}>
              {t("platform.review.approve")}
            </Button>
            <Button variant="danger" onClick={() => setDialog("reject")}>
              {t("platform.review.reject")}
            </Button>
          </>
        )}
      </div>
      {underReview && !allAccepted && (
        <p className="m-0 text-body-sm text-fg-secondary">{t("platform.review.acceptAllFirst")}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 font-heading text-h3">{t("platform.review.details")}</h2>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {(
              [
                [t("platform.review.type"), data.facility.facility_type],
                [t("platform.review.ownership"), data.facility.ownership],
                [t("platform.review.organization"), data.facility.organization_name],
                [
                  t("platform.review.contacts"),
                  [data.facility.phone, data.facility.email].filter(Boolean).join(" · "),
                ],
                [
                  t("platform.review.location"),
                  [data.location.path.map((p) => p.name).join(", "), data.location.address]
                    .filter(Boolean)
                    .join(" · "),
                ],
                [
                  t("platform.applications.applicant"),
                  `${data.applicant.name} · ${data.applicant.email} · ${data.applicant.position}`,
                ],
                [
                  t("platform.review.proposedAdmin"),
                  [data.proposed_admin.name, data.proposed_admin.email, data.proposed_admin.phone]
                    .filter(Boolean)
                    .join(" · "),
                ],
                [t("platform.review.insurers"), data.claimed_insurer_codes.join(", ")],
                [t("platform.applications.submitted"), formatDate(data.submitted_at, locale)],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="m-0">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="m-0 font-heading text-h3">{t("platform.review.documents")}</h2>
          {data.documents.length === 0 && (
            <p className="m-0 text-fg-muted">{t("platform.review.noDocuments")}</p>
          )}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {data.documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{t(`platform.documentKind.${doc.kind}`)}</span>
                  <Badge
                    tone={
                      doc.review_status === "accepted"
                        ? "success"
                        : doc.review_status === "needs_change"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {t(`platform.review.verdict.${doc.review_status}`)}
                  </Badge>
                </div>
                <p className="m-0 text-body-sm text-fg-secondary">
                  {doc.upload.original_filename}
                  {doc.number && ` · ${doc.number}`}
                  {doc.expires_on &&
                    ` · ${t("platform.review.expires", { date: formatDate(doc.expires_on, locale) })}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={doc.upload.status !== "clean"}
                    onClick={() => setViewing(doc)}
                  >
                    {t("platform.review.view")}
                  </Button>
                  {underReview && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => reviewDocument.mutate({ doc: doc.id, verdict: "accepted" })}
                      >
                        {t("platform.review.accept")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          reviewDocument.mutate({ doc: doc.id, verdict: "needs_change" })
                        }
                      >
                        {t("platform.review.needsChange")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <NotesCard id={id} />

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h3">{t("platform.review.history")}</h2>
        <Timeline
          locale={locale}
          events={(events.data ?? []).map((e) => ({
            id: e.id,
            at: e.occurred_at,
            title:
              e.kind === "status_change"
                ? t(`platform.status.application.${e.to_status}`)
                : t(`platform.review.event.${e.kind}`),
            actor: e.actor?.full_name ?? t(`platform.review.actor.${e.actor_kind}`),
            text: e.note || undefined,
          }))}
        />
      </Card>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.upload.original_filename ?? ""}
        closeLabel={t("lock.close")}
        size="lg"
      >
        {viewing && (
          <DocumentViewer
            contentType={viewing.upload.content_type}
            filename={viewing.upload.original_filename}
            getLink={(disposition) =>
              api.onboarding.platform.documentLink(id, viewing.id, disposition)
            }
            labels={viewerLabels}
          />
        )}
      </Dialog>
      <RequestChangesDialog
        app={data}
        open={dialog === "changes"}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
      <ApproveDialog
        app={data}
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
      <RejectDialog
        app={data}
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
    </div>
  );
}

function NotesCard({ id }: { id: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const notes = useQuery({
    queryKey: [...key(id), "notes"],
    queryFn: () => api.onboarding.platform.notes(id),
  });
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"call" | "visit" | "document_check" | "other">("call");
  const add = useMutation({
    mutationFn: () => api.onboarding.platform.addNote(id, { note_kind: kind, text: text.trim() }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: key(id) });
    },
  });
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-heading text-h3">{t("platform.review.notes")}</h2>
      <p className="m-0 text-body-sm text-fg-secondary">{t("platform.review.notesHint")}</p>
      <Timeline
        locale={locale}
        emptyMessage={t("platform.review.noNotes")}
        events={(notes.data ?? []).map((n) => ({
          id: n.id,
          at: n.occurred_at,
          title: t(`platform.review.noteKind.${n.note_kind || "other"}`),
          actor: n.actor?.full_name,
          text: n.note,
        }))}
      />
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <SelectField
          label={t("platform.review.noteType")}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {(["call", "visit", "document_check", "other"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`platform.review.noteKind.${k}`)}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label={t("platform.review.note")}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />
        <div>
          <Button type="submit" variant="secondary" loading={add.isPending}>
            {t("platform.review.addNote")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface DialogProps {
  app: PlatformApplication;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

function RequestChangesDialog({ app, open, onClose, onDone }: DialogProps) {
  const { t } = useTranslation();
  const api = useApi();
  const idem = useIdempotencyKey();
  const [general, setGeneral] = useState("");
  const [items, setItems] = useState<{ target: string; comment: string }[]>([
    { target: "documents.moh_licence", comment: "" },
  ]);
  const [error, setError] = useState<string | undefined>();
  const targets = [
    "facility.name",
    "facility.facility_type",
    "facility.ownership",
    "facility.phone",
    "facility.email",
    "location.village_code",
    "location.address",
    "proposed_admin.name",
    "proposed_admin.email",
    ...app.documents.map((d) => `documents.${d.id}`),
    "documents.moh_licence",
    "documents.rdb_registration",
    "documents.tin_certificate",
  ];
  const send = useMutation({
    mutationFn: () =>
      api.onboarding.platform.requestChanges(
        app.id,
        {
          version: app.version,
          general_comment: general,
          items: items.filter((i) => i.comment.trim()),
        },
        idem.current(),
      ),
    onSuccess: () => {
      idem.renew();
      onClose();
      onDone();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.some((i) => i.comment.trim())) {
      setError(t("platform.review.itemRequired"));
      return;
    }
    send.mutate();
  }
  const label = (target: string) => {
    const doc = app.documents.find((d) => target === `documents.${d.id}`);
    return doc
      ? `${t("platform.review.documents")}: ${doc.upload.original_filename}`
      : t(`platform.review.target.${target}`, { defaultValue: target });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.review.requestChanges")}
      description={t("platform.review.requestChangesHint")}
      closeLabel={t("lock.close")}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("lock.cancel")}
          </Button>
          <Button type="submit" form="request-changes" loading={send.isPending}>
            {t("platform.review.sendRequest")}
          </Button>
        </>
      }
    >
      <form id="request-changes" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextareaField
          label={t("platform.review.generalComment")}
          optional
          value={general}
          onChange={(e) => setGeneral(e.target.value)}
          rows={3}
        />
        {items.map((item, index) => (
          <fieldset key={index} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 font-semibold">
              {t("platform.review.item", { n: index + 1 })}
            </legend>
            <SelectField
              label={t("platform.review.itemTarget")}
              value={item.target}
              onChange={(e) =>
                setItems((list) =>
                  list.map((it, i) => (i === index ? { ...it, target: e.target.value } : it)),
                )
              }
            >
              {[...new Set(targets)].map((target) => (
                <option key={target} value={target}>
                  {label(target)}
                </option>
              ))}
            </SelectField>
            <TextareaField
              label={t("platform.review.itemComment")}
              value={item.comment}
              rows={2}
              onChange={(e) =>
                setItems((list) =>
                  list.map((it, i) => (i === index ? { ...it, comment: e.target.value } : it)),
                )
              }
            />
          </fieldset>
        ))}
        <div>
          <Button
            variant="ghost"
            onClick={() => setItems((list) => [...list, { target: "facility.name", comment: "" }])}
          >
            {t("platform.review.addItem")}
          </Button>
        </div>
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

function ApproveDialog({ app, open, onClose, onDone }: DialogProps) {
  const { t } = useTranslation();
  const api = useApi();
  const { withStepUp } = useStepUp();
  const idem = useIdempotencyKey();
  const moh = app.documents.find((d) => d.kind === "moh_licence");
  const [values, setValues] = useState({
    slug: app.suggested_slug,
    organization_name: app.facility.organization_name || app.facility.name,
    facility_type: app.facility.facility_type || "private_clinic",
    ownership: app.facility.ownership || "private",
    number: moh?.number ?? "",
    expires_on: moh?.expires_on ?? "",
  });
  const [error, setError] = useState<string | undefined>();
  const approve = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.onboarding.platform.approve(
          app.id,
          {
            version: app.version,
            slug: values.slug.trim(),
            organization_name: values.organization_name.trim(),
            facility_type: values.facility_type,
            ownership: values.ownership,
            licences: [
              {
                ...(moh ? { document_id: moh.id } : {}),
                kind: "moh_operating",
                number: values.number.trim(),
                expires_on: values.expires_on,
              },
            ],
          },
          idem.current(),
        ),
      ),
    onSuccess: () => {
      idem.renew();
      onClose();
      onDone();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.review.approveTitle")}
      consequences={t("platform.review.approveConsequences")}
      confirmLabel={t("platform.review.approve")}
      cancelLabel={t("lock.cancel")}
      closeLabel={t("lock.close")}
      busy={approve.isPending}
      error={error}
      onConfirm={() => {
        if (!values.slug.trim() || !values.number.trim() || !values.expires_on) {
          setError(t("platform.review.approveRequired"));
          return;
        }
        approve.mutate();
      }}
    >
      <TextField
        label={t("platform.review.slug")}
        hint={t("platform.review.slugHint")}
        value={values.slug}
        onChange={set("slug")}
      />
      <TextField
        label={t("platform.review.organization")}
        value={values.organization_name}
        onChange={set("organization_name")}
      />
      <TextField
        label={t("platform.review.type")}
        value={values.facility_type}
        onChange={set("facility_type")}
      />
      <SelectField
        label={t("platform.review.ownership")}
        value={values.ownership}
        onChange={set("ownership")}
      >
        {(["public", "private", "faith_based", "ngo"] as const).map((o) => (
          <option key={o} value={o}>
            {t(`platform.ownership.${o}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t("platform.review.licenceNumber")}
        value={values.number}
        onChange={set("number")}
      />
      <TextField
        label={t("platform.review.licenceExpiry")}
        type="date"
        value={values.expires_on}
        onChange={set("expires_on")}
      />
    </ConfirmDialog>
  );
}

function RejectDialog({ app, open, onClose, onDone }: DialogProps) {
  const { t } = useTranslation();
  const api = useApi();
  const { withStepUp } = useStepUp();
  const idem = useIdempotencyKey();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const reasons = useReasons("application_rejection");
  const reject = useMutation({
    mutationFn: (text: string) =>
      withStepUp(() =>
        api.onboarding.platform.reject(
          app.id,
          { version: app.version, reason_code: reason, reason_text: text },
          idem.current(),
        ),
      ),
    onSuccess: () => {
      idem.renew();
      onClose();
      onDone();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const requiresText = reasons.find((r) => r.code === reason)?.requires_text ?? false;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.review.rejectTitle")}
      consequences={t("platform.review.rejectConsequences")}
      confirmLabel={t("platform.review.reject")}
      cancelLabel={t("lock.cancel")}
      closeLabel={t("lock.close")}
      tone="danger"
      reasonLabel={t("platform.reason.text")}
      reasonRequired={requiresText}
      reasonRequiredMessage={t("platform.reason.textRequired")}
      busy={reject.isPending}
      error={error}
      onConfirm={(text) => {
        if (!reason) {
          setError(t("platform.reason.required"));
          return;
        }
        reject.mutate(text);
      }}
    >
      <ReasonSelect reasons={reasons} value={reason} onChange={setReason} />
    </ConfirmDialog>
  );
}

export interface ReasonOption {
  code: string;
  label: string;
  requires_text: boolean;
}

export function useReasons(kind: string): ReasonOption[] {
  const api = useApi();
  const query = useQuery({
    queryKey: ["staff", "reasons", kind],
    queryFn: () => api.masterData.staffList("reason-codes", { kind, page_size: 100 }),
    staleTime: 10 * 60_000,
  });
  return (query.data?.results ?? []).map((r) => ({
    code: String(r.code),
    label: typeof r.label === "string" && r.label ? r.label : String(r.code),
    requires_text: Boolean(r.requires_text),
  }));
}

export function ReasonSelect({
  reasons,
  value,
  onChange,
}: {
  reasons: ReasonOption[];
  value: string;
  onChange: (code: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SelectField
      label={t("platform.reason.code")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t("platform.reason.choose")}</option>
      {reasons.map((r) => (
        <option key={r.code} value={r.code}>
          {r.label}
        </option>
      ))}
    </SelectField>
  );
}
