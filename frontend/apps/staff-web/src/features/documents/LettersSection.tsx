import {
  REFERRAL_URGENCIES,
  type Consultation,
  type LabRequest,
  type Referral,
  type ReferralUrgency,
  type SickNote,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  CheckboxField,
  LoadingState,
  SelectField,
  TextareaField,
  TextField,
} from "@medilink/ui";
import { Flask, FirstAidKit, Plus, SignOut } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { useStepUp } from "../lock";
import { DocumentLine, documentsKeys, errorText, useCan, useWhen } from "./shared";

type Kind = "referral" | "lab_request" | "sick_note";
const KINDS: Kind[] = ["referral", "lab_request", "sick_note"];
const ICONS = { referral: SignOut, lab_request: Flask, sick_note: FirstAidKit };

/**
 * The consultation's Letters and requests section (S7-F7, FR-DOC-01, CR1), mounted by the S6 page
 * in its `[S7]` slot. While the consultation is a draft, the author writes referral letters, lab
 * requests and sick notes that are signed with it; after signing, a new one is signed at once
 * (step-up). Each signed one becomes a PDF with a QR code, listed with the visit's documents.
 */
export function LettersSection({ consultation: c }: { consultation: Consultation }) {
  const { t } = useTranslation();
  const api = useApi();
  const canView = useCan("clinical.view");
  const { data: me } = useStaffMe();
  // only the consultation's author writes them (contract CR1)
  const isAuthor = useCan("clinical.write") && me?.full_name === c.author.full_name;
  const [adding, setAdding] = useState<Kind | null>(null);
  const referrals = useQuery({
    queryKey: documentsKeys.letters(c.id, "referral"),
    queryFn: () => api.documents.referrals(c.id),
    enabled: canView,
  });
  const labs = useQuery({
    queryKey: documentsKeys.letters(c.id, "lab_request"),
    queryFn: () => api.documents.labRequests(c.id),
    enabled: canView,
  });
  const notes = useQuery({
    queryKey: documentsKeys.letters(c.id, "sick_note"),
    queryFn: () => api.documents.sickNotes(c.id),
    enabled: canView,
  });
  const documents = useQuery({
    queryKey: documentsKeys.forVisit(c.visit_id),
    queryFn: () => api.documents.list({ visit_id: c.visit_id }),
    enabled: canView && c.status === "signed",
  });
  if (!canView || c.status === "entered_in_error") return null;
  const pending = referrals.isPending || labs.isPending || notes.isPending;
  const failed = referrals.error ?? labs.error ?? notes.error;
  const rows = [
    ...(referrals.data ?? []).map((r) => ({ kind: "referral" as const, row: r })),
    ...(labs.data ?? []).map((r) => ({ kind: "lab_request" as const, row: r })),
    ...(notes.data ?? []).map((r) => ({ kind: "sick_note" as const, row: r })),
  ];
  const docs = documents.data?.results ?? [];

  return (
    <section
      id="letters"
      tabIndex={-1}
      aria-labelledby="letters-title"
      className="flex scroll-mt-24 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h2 id="letters-title" className="m-0 text-h3">
          {t("documents.letters.title")}
        </h2>
        <p className="m-0 text-body-sm text-fg-secondary">
          {c.status === "draft"
            ? t("documents.letters.draftHint")
            : t("documents.letters.signedHint")}
        </p>
      </div>
      {pending ? (
        <LoadingState label={t("documents.loading")} />
      ) : failed ? (
        <Alert tone="danger" role="alert">
          {errorText(failed, t("errors.generic"))}
        </Alert>
      ) : rows.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border/60 p-0">
          {rows.map(({ kind, row }) => (
            <LetterLine key={row.id} kind={kind} row={row} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-fg-muted">{t("documents.letters.none")}</p>
      )}

      {adding ? (
        <LetterForm consultation={c} kind={adding} onDone={() => setAdding(null)} />
      ) : (
        isAuthor && (
          <div className="flex flex-wrap gap-2">
            {KINDS.map((kind) => {
              const Icon = ICONS[kind];
              return (
                <Button key={kind} variant="secondary" onClick={() => setAdding(kind)}>
                  <Plus aria-hidden="true" weight="bold" className="size-icon" />
                  <Icon aria-hidden="true" className="size-icon" />
                  {t(`documents.letters.add.${kind}`)}
                </Button>
              );
            })}
          </div>
        )
      )}

      {c.status === "signed" && docs.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
          <h3 className="m-0 text-body font-semibold">{t("documents.letters.visitDocuments")}</h3>
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 p-0">
            {docs.map((d) => (
              <DocumentLine key={d.id} document={d} mode="download" />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function LetterLine({ kind, row }: { kind: Kind; row: Referral | LabRequest | SickNote }) {
  const { t } = useTranslation();
  const when = useWhen();
  const Icon = ICONS[kind];
  let summary: ReactNode;
  if (kind === "referral") {
    const r = row as Referral;
    summary = t("documents.letters.referralLine", {
      to: r.to_facility_name,
      specialty: r.specialty,
      urgency: t(`documents.urgency.${r.urgency}`),
    });
  } else if (kind === "lab_request") {
    summary = (row as LabRequest).tests.map((test) => test.name).join(", ");
  } else {
    const r = row as SickNote;
    summary = t("documents.letters.sickLine", {
      from: when.date(`${r.rest_from}T12:00:00Z`),
      to: when.date(`${r.rest_to}T12:00:00Z`),
    });
  }
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon aria-hidden="true" weight="duotone" className="mt-0.5 size-5 shrink-0 text-brand" />
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold">{t(`documents.kind.${kind}`)}</span>
        <span className="text-body-sm text-fg-secondary">{summary}</span>
        <span className="text-body-sm text-fg-muted">
          {row.signed_at
            ? t("documents.letters.signedAt", { time: when.dateTime(row.signed_at) })
            : t("documents.letters.signsWith")}
        </span>
      </div>
    </li>
  );
}

function LetterForm({
  consultation: c,
  kind,
  onDone,
}: {
  consultation: Consultation;
  kind: Kind;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [tried, setTried] = useState(false);
  const [to, setTo] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [urgency, setUrgency] = useState<ReferralUrgency>("routine");
  const [reason, setReason] = useState("");
  const [tests, setTests] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const signed = c.status === "signed";
  const testList = tests
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
  const missing = (value: string) =>
    tried && !value.trim() ? t("documents.form.required") : undefined;
  const datesWrong = tried && from && until && until < from;

  const save = useMutation({
    mutationFn: () => {
      const send = (): Promise<unknown> => {
        if (kind === "referral")
          return api.documents.addReferral(c.id, {
            to_facility_name: to.trim(),
            specialty: specialty.trim(),
            reason: reason.trim(),
            urgency,
          });
        if (kind === "lab_request")
          return api.documents.addLabRequest(c.id, {
            tests: testList.map((name) => ({ code: "", name })),
            reason: reason.trim(),
          });
        return api.documents.addSickNote(c.id, {
          rest_from: from,
          rest_to: until,
          show_diagnosis: showDiagnosis,
        });
      };
      // after signing it is signed at once: a signing act (contract CR1)
      return signed ? withStepUp(send) : send();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clinical"] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    const ok =
      kind === "referral"
        ? to.trim() && specialty.trim() && reason.trim()
        : kind === "lab_request"
          ? testList.length > 0 && reason.trim()
          : from && until && until >= from;
    if (ok) save.mutate();
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="letter-form-title"
      className="flex flex-col gap-3 rounded-2xl border border-border/60 p-3"
    >
      <h3 id="letter-form-title" className="m-0 text-body font-semibold">
        {t(`documents.letters.add.${kind}`)}
      </h3>
      {kind === "referral" && (
        <>
          <TextField
            label={t("documents.form.to")}
            value={to}
            maxLength={200}
            onChange={(e) => setTo(e.target.value)}
            error={missing(to)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t("documents.form.specialty")}
              value={specialty}
              maxLength={100}
              onChange={(e) => setSpecialty(e.target.value)}
              error={missing(specialty)}
            />
            <SelectField
              label={t("documents.form.urgency")}
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as ReferralUrgency)}
            >
              {REFERRAL_URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {t(`documents.urgency.${u}`)}
                </option>
              ))}
            </SelectField>
          </div>
        </>
      )}
      {kind === "lab_request" && (
        <TextareaField
          label={t("documents.form.tests")}
          hint={t("documents.form.testsHint")}
          rows={3}
          value={tests}
          onChange={(e) => setTests(e.target.value)}
          error={tried && !testList.length ? t("documents.form.testsRequired") : undefined}
        />
      )}
      {kind !== "sick_note" ? (
        <TextareaField
          label={t("documents.form.reason")}
          rows={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={missing(reason)}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              type="date"
              label={t("documents.form.from")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              error={missing(from)}
            />
            <TextField
              type="date"
              label={t("documents.form.until")}
              value={until}
              min={from || undefined}
              onChange={(e) => setUntil(e.target.value)}
              error={datesWrong ? t("documents.form.datesOrder") : missing(until)}
            />
          </div>
          <CheckboxField
            label={t("documents.form.showDiagnosis")}
            hint={t("documents.form.showDiagnosisHint")}
            checked={showDiagnosis}
            onChange={(e) => setShowDiagnosis(e.target.checked)}
          />
        </>
      )}
      {save.isError && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("errors.generic"))}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending}>
          {signed ? t("documents.form.signNow") : t("documents.form.save")}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t("documents.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
