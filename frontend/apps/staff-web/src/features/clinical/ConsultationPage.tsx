import {
  isApiError,
  SECTION_FIELDS,
  type Consultation,
  type SectionField,
} from "@medilink/api-client";
import {
  Alert,
  AllergyBanner,
  AutosaveStatus,
  Badge,
  Button,
  ConfirmDialog,
  LoadingState,
  SectionAnchors,
  SwitchField,
  TextareaField,
  TextField,
  type AutosaveState,
} from "@medilink/ui";
import { ClockCounterClockwise, LockKey, PenNib, ShieldWarning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { useStepUp } from "../lock";
import { AccessReasonPrompt } from "./AccessGate";
import { DiagnosisPicker, type PickedDiagnosis } from "./DiagnosisPicker";
import { HistoryDrawer } from "./History";
import {
  clinicalKeys,
  errorText,
  isReasonRequired,
  useAllergyItems,
  useCan,
  useWhen,
} from "./shared";
import { VitalsPanel } from "./VitalsPanel";
// [S7 imports]
import { LettersSection } from "../documents";
import { PrescriptionSection } from "../pharmacy";
// [/S7 imports]

const AUTOSAVE_MS = 1500;

interface Local {
  sections: Record<SectionField, string>;
  is_restricted: boolean;
  diagnoses: PickedDiagnosis[];
}

const fromServer = (c: Consultation): Local => ({
  sections: Object.fromEntries(SECTION_FIELDS.map((f) => [f, c[f]])) as Record<
    SectionField,
    string
  >,
  is_restricted: c.is_restricted,
  diagnoses: c.diagnoses.map((d) => ({
    code: d.code,
    rank: d.rank,
    certainty: d.certainty,
    label:
      d.plain_language && d.plain_language !== d.display
        ? `${d.plain_language} (${d.display})`
        : d.display,
    isSensitive: d.is_sensitive,
  })),
});

const SECTION_IDS: Record<SectionField, string> = {
  history_text: "history",
  examination_text: "examination",
  plan_text: "plan",
  patient_instructions_text: "instructions",
  private_notes: "private-notes",
};

function Section({
  id,
  title,
  children,
  note,
}: {
  id: string;
  title: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg bg-surface shadow-card p-4"
    >
      <h2 id={`${id}-title`} className="m-0 text-h3">
        {title}
      </h2>
      {note}
      {children}
    </section>
  );
}

/** Draft editing with autosave (C3): `version` on every save, `409` reloads the record. */
function useAutosave(c: Consultation) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<Local>(() => fromServer(c));
  const [state, setState] = useState<AutosaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const version = useRef(c.version);
  const latest = useRef(local);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const dirty = useRef(false);
  // `save` re-runs itself after an in-flight save when edits came in meanwhile.
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const save = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    if (!dirty.current) return Promise.resolve();
    dirty.current = false;
    const body = latest.current;
    setState("saving");
    const run = api.clinical
      .update(c.id, {
        version: version.current,
        ...body.sections,
        is_restricted: body.is_restricted,
        diagnoses: body.diagnoses.map(({ code, rank, certainty }) => ({ code, rank, certainty })),
      })
      .then((fresh) => {
        version.current = fresh.version;
        queryClient.setQueryData(clinicalKeys.consultation(c.id), fresh);
        setSavedAt(new Date().toISOString());
        setSaveError(null);
        setState(dirty.current ? "dirty" : "saved");
      })
      .catch(async (error: unknown) => {
        if (isApiError(error) && error.status === 409) {
          const fresh = await api.clinical.get(c.id);
          version.current = fresh.version;
          queryClient.setQueryData(clinicalKeys.consultation(c.id), fresh);
          const reloaded = fromServer(fresh);
          latest.current = reloaded;
          setLocal(reloaded);
          setConflict(true);
          setState("idle");
          return;
        }
        dirty.current = true;
        setSaveError(error);
        setState("error");
      })
      .finally(() => {
        inFlight.current = null;
        if (again.current) {
          again.current = false;
          void saveRef.current();
        }
      });
    inFlight.current = run;
    return run;
  }, [api, c.id, queryClient]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const edit = (patch: Partial<Local>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setLocal(next);
    dirty.current = true;
    setConflict(false);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** Saves what is pending and returns the version the next action must send. */
  const flush = async () => {
    await save();
    if (inFlight.current) await inFlight.current;
    return version.current;
  };

  return { local, edit, state, savedAt, conflict, saveError, flush, retry: save };
}

function DraftEditor({ c }: { c: Consultation }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const when = useWhen();
  const draft = useAutosave(c);
  const [signError, setSignError] = useState<unknown>(null);
  const [signing, setSigning] = useState(false);
  const sensitive = draft.local.diagnoses.some((d) => d.isSensitive);
  const hasPrimary = draft.local.diagnoses.some((d) => d.rank === "primary");

  const sign = async () => {
    setSignError(null);
    setSigning(true);
    try {
      const version = await draft.flush();
      const signed = await withStepUp(() => api.clinical.sign(c.id, version));
      queryClient.setQueryData(clinicalKeys.consultation(c.id), signed);
      await queryClient.invalidateQueries({ queryKey: clinicalKeys.all });
    } catch (error) {
      setSignError(error);
    } finally {
      setSigning(false);
    }
  };

  const status =
    draft.state === "saving"
      ? t("clinical.autosave.saving")
      : draft.state === "dirty"
        ? t("clinical.autosave.dirty")
        : draft.state === "error"
          ? t("clinical.autosave.error")
          : draft.savedAt
            ? t("clinical.autosave.saved", { time: when.time(draft.savedAt) })
            : t("clinical.autosave.idle");

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg py-3">
        <AutosaveStatus
          state={draft.state}
          label={status}
          action={
            draft.state === "error" ? (
              <Button variant="ghost" onClick={() => void draft.retry()}>
                {t("common.retry")}
              </Button>
            ) : undefined
          }
        />
        {c.can_sign && (
          <Button className="ms-auto" onClick={() => void sign()} disabled={signing || !hasPrimary}>
            <PenNib aria-hidden="true" className="size-icon" />
            {t("clinical.sign.action")}
          </Button>
        )}
      </div>
      {!hasPrimary && c.can_sign && (
        <p className="m-0 text-body-sm text-fg-muted">{t("clinical.sign.needPrimary")}</p>
      )}
      {draft.conflict && (
        <Alert tone="warning" role="alert">
          {t("clinical.autosave.conflict")}
        </Alert>
      )}
      {draft.state === "error" && (
        <Alert tone="danger" role="alert">
          {errorText(draft.saveError, t("errors.generic"))}
        </Alert>
      )}
      {Boolean(signError) && errorText(signError, t("errors.generic")) && (
        <Alert tone="danger" role="alert">
          {errorText(signError, t("errors.generic"))}
        </Alert>
      )}

      <Section id="vitals" title={t("clinical.sections.vitals")}>
        <VitalsPanel visitId={c.visit_id} />
      </Section>
      {SECTION_FIELDS.filter((f) => f !== "private_notes").map((field) => (
        <Section
          key={field}
          id={SECTION_IDS[field]}
          title={t(`clinical.sections.${SECTION_IDS[field]}`)}
        >
          <TextareaField
            label={t(`clinical.sections.${SECTION_IDS[field]}`)}
            hideLabel
            rows={field === "examination_text" || field === "history_text" ? 5 : 4}
            value={draft.local.sections[field]}
            readOnly={!c.can_edit}
            onChange={(e) =>
              draft.edit({ sections: { ...draft.local.sections, [field]: e.target.value } })
            }
            {...(field === "patient_instructions_text"
              ? { hint: t("clinical.sections.instructionsHint") }
              : {})}
          />
        </Section>
      ))}
      <Section id="diagnosis" title={t("clinical.sections.diagnosis")}>
        <DiagnosisPicker
          value={draft.local.diagnoses}
          disabled={!c.can_edit}
          onChange={(diagnoses) => draft.edit({ diagnoses })}
        />
        {sensitive && !draft.local.is_restricted && (
          <Alert tone="warning">{t("clinical.restricted.suggest")}</Alert>
        )}
        <SwitchField
          label={t("clinical.restricted.label")}
          hint={t("clinical.restricted.hint")}
          checked={draft.local.is_restricted}
          disabled={!c.can_edit}
          stateLabel={
            draft.local.is_restricted ? t("clinical.restricted.on") : t("clinical.restricted.off")
          }
          onCheckedChange={(is_restricted) => draft.edit({ is_restricted })}
        />
      </Section>
      <Section
        id="private-notes"
        title={t("clinical.sections.private-notes")}
        note={
          <p className="m-0 flex items-center gap-2 font-semibold text-warning">
            <LockKey aria-hidden="true" weight="bold" className="size-icon" />
            {t("clinical.privateNotes.never")}
          </p>
        }
      >
        <TextareaField
          label={t("clinical.sections.private-notes")}
          hideLabel
          rows={3}
          value={draft.local.sections.private_notes}
          readOnly={!c.can_edit}
          onChange={(e) =>
            draft.edit({ sections: { ...draft.local.sections, private_notes: e.target.value } })
          }
        />
      </Section>
    </>
  );
}

function SignedView({ c }: { c: Consultation }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const { data: me } = useStaffMe();
  const when = useWhen();
  const canAmend = useCan("clinical.amend_own");
  const canWrite = useCan("clinical.write");
  const isAuthor = me?.full_name === c.author.full_name;
  const [reason, setReason] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: clinicalKeys.all });
  const addendum = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.clinical.addAddendum(c.id, { reason: reason.trim(), body: body.trim() }),
      ),
    onSuccess: async () => {
      setReason("");
      setBody("");
      setTried(false);
      await refresh();
    },
  });
  const mark = useMutation({
    mutationFn: (why: string) =>
      withStepUp(() => api.clinical.markEnteredInError(c.id, { version: c.version, reason: why })),
    onSuccess: async () => {
      setMarkOpen(false);
      await refresh();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (reason.trim() && body.trim()) addendum.mutate();
  };
  const text = (value: string) =>
    value ? (
      <p className="m-0 whitespace-pre-wrap">{value}</p>
    ) : (
      <p className="m-0 text-fg-muted">{t("clinical.empty")}</p>
    );
  const signedOk = c.status === "signed";
  return (
    <>
      {c.entered_in_error && (
        <Alert tone="danger" title={t("clinical.enteredInError.banner")}>
          {t("clinical.enteredInError.detail", {
            reason: c.entered_in_error.reason,
            name: c.entered_in_error.by_name ?? "—",
            time: when.dateTime(c.entered_in_error.at),
          })}
        </Alert>
      )}
      {c.integrity === "mismatch" && (
        <Alert tone="danger" title={t("clinical.integrity.mismatch")} />
      )}
      {c.signed_at && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-fg-secondary">
          <ShieldWarning aria-hidden="true" className="size-icon" />
          {t("clinical.sign.signedBy", {
            name: c.author.full_name,
            time: when.dateTime(c.signed_at),
          })}
          {c.content_hash && (
            <span className="font-mono text-body-sm" title={c.content_hash}>
              {t("clinical.sign.fingerprint", { hash: c.content_hash.slice(0, 12) })}
            </span>
          )}
        </p>
      )}
      <Section id="vitals" title={t("clinical.sections.vitals")}>
        <VitalsPanel visitId={c.visit_id} />
      </Section>
      {SECTION_FIELDS.filter((f) => f !== "private_notes").map((field) => (
        <Section
          key={field}
          id={SECTION_IDS[field]}
          title={t(`clinical.sections.${SECTION_IDS[field]}`)}
        >
          {text(c[field])}
        </Section>
      ))}
      <Section id="diagnosis" title={t("clinical.sections.diagnosis")}>
        {c.diagnoses.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {c.diagnoses.map((d) => (
              <li key={d.id}>
                <span className="font-mono font-semibold">{d.code}</span> {d.display} ·{" "}
                {t(`clinical.diagnosis.${d.rank}`)} · {t(`clinical.diagnosis.${d.certainty}`)}
              </li>
            ))}
          </ul>
        ) : (
          text("")
        )}
      </Section>
      <Section
        id="private-notes"
        title={t("clinical.sections.private-notes")}
        note={
          <p className="m-0 flex items-center gap-2 font-semibold text-warning">
            <LockKey aria-hidden="true" weight="bold" className="size-icon" />
            {t("clinical.privateNotes.never")}
          </p>
        }
      >
        {text(c.private_notes)}
      </Section>
      <Section id="addenda" title={t("clinical.sections.addenda")}>
        {c.addenda.length ? (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {c.addenda.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3">
                <p className="m-0 text-body-sm text-fg-muted">
                  {t("clinical.addendum.by", {
                    name: a.author_name,
                    time: when.dateTime(a.signed_at),
                  })}
                  {!a.is_by_author && ` · ${t("clinical.addendum.notAuthor")}`}
                </p>
                <p className="m-0 font-semibold">{a.reason}</p>
                <p className="m-0 whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-fg-muted">{t("clinical.addendum.none")}</p>
        )}
        {signedOk && canWrite && (!isAuthor || canAmend) && (
          <form
            onSubmit={submit}
            noValidate
            className="flex flex-col gap-3"
            aria-label={t("clinical.addendum.add")}
          >
            <TextField
              label={t("clinical.addendum.reason")}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              error={tried && !reason.trim() ? t("clinical.reasonRequired") : undefined}
            />
            <TextareaField
              label={t("clinical.addendum.body")}
              value={body}
              rows={3}
              maxLength={10000}
              onChange={(e) => setBody(e.target.value)}
              error={tried && !body.trim() ? t("clinical.addendum.bodyRequired") : undefined}
            />
            {addendum.isError && errorText(addendum.error, t("errors.generic")) && (
              <Alert tone="danger" role="alert">
                {errorText(addendum.error, t("errors.generic"))}
              </Alert>
            )}
            <Button
              type="submit"
              variant="secondary"
              className="self-start"
              disabled={addendum.isPending}
            >
              {t("clinical.addendum.add")}
            </Button>
          </form>
        )}
      </Section>
      {c.status !== "entered_in_error" && isAuthor && canAmend && (
        <Button variant="danger" className="self-start" onClick={() => setMarkOpen(true)}>
          {t("clinical.enteredInError.action")}
        </Button>
      )}
      <ConfirmDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        title={t("clinical.enteredInError.title")}
        consequences={t("clinical.enteredInError.consequences")}
        confirmLabel={t("clinical.enteredInError.action")}
        cancelLabel={t("clinical.cancel")}
        closeLabel={t("clinical.close")}
        tone="danger"
        reasonLabel={t("clinical.reason")}
        reasonRequired
        reasonRequiredMessage={t("clinical.reasonRequired")}
        busy={mark.isPending}
        error={errorText(mark.error, t("errors.generic"))}
        onConfirm={(why) => mark.mutate(why)}
      />
    </>
  );
}

/** /clinical/consultations/:consultationId — the consultation page (design 04 §3.2). */
export function ConsultationPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { consultationId = "" } = useParams();
  const [search] = useSearchParams();
  const allowed = useCan("clinical.view");
  const allergyItems = useAllergyItems();
  const [historyOpen, setHistoryOpen] = useState(false);
  const consultation = useQuery({
    queryKey: clinicalKeys.consultation(consultationId),
    queryFn: () => api.clinical.get(consultationId),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  if (consultation.isPending) return <LoadingState label={t("clinical.loading")} />;
  if (consultation.isError) {
    const fp = search.get("fp");
    if (isReasonRequired(consultation.error) && fp)
      return (
        <div className="flex max-w-5xl flex-col gap-5">
          <PageHeader title={t("clinical.title")} />
          <AccessReasonPrompt fpId={fp} onGranted={() => void consultation.refetch()} />
        </div>
      );
    return (
      <Alert tone="danger" role="alert">
        {errorText(consultation.error, t("errors.generic"))}
      </Alert>
    );
  }
  const c = consultation.data;
  const p = c.patient;
  const isDraft = c.status === "draft";
  const facts = [
    p.sex ? t(`clinical.sex.${p.sex}`) : null,
    p.age_years !== null ? t("clinical.age", { count: p.age_years }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sections = [
    { id: "vitals", label: t("clinical.sections.vitals") },
    { id: "history", label: t("clinical.sections.history") },
    { id: "examination", label: t("clinical.sections.examination") },
    { id: "diagnosis", label: t("clinical.sections.diagnosis") },
    { id: "plan", label: t("clinical.sections.plan") },
    // [S7]
    ...(c.status === "entered_in_error"
      ? []
      : [
          { id: "prescription", label: t("pharmacy.prescription.title") },
          { id: "letters", label: t("documents.letters.title") },
        ]),
    // [/S7]
    { id: "instructions", label: t("clinical.sections.instructions") },
    { id: "private-notes", label: t("clinical.sections.private-notes") },
    ...(isDraft ? [] : [{ id: "addenda", label: t("clinical.sections.addenda") }]),
  ];
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader
        title={t("clinical.headerTitle", { name: p.display_name })}
        description={facts}
        back={{ to: "/clinical/consultation", label: t("clinical.start.title") }}
        badges={
          <>
            <Badge tone={isDraft ? "warning" : c.status === "signed" ? "success" : "danger"}>
              {t(`clinical.status.${c.status}`)}
            </Badge>
            {c.is_restricted && (
              <Badge tone="warning" icon={LockKey}>
                {t("clinical.restricted.badge")}
              </Badge>
            )}
            {c.is_late_entry && <Badge tone="info">{t("clinical.lateEntry")}</Badge>}
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
            <ClockCounterClockwise aria-hidden="true" className="size-icon" />
            {t("clinical.history.open")}
          </Button>
        }
      />
      <AllergyBanner
        allergies={allergyItems(c.allergies)}
        noKnownAllergies={c.no_known_allergies}
        title={t("clinical.allergy.title")}
        noneLabel={t("clinical.allergy.none")}
        unknownLabel={t("clinical.allergy.unknown")}
      />
      <SectionAnchors sections={sections} label={t("clinical.sections.nav")} />
      {isDraft && c.can_edit ? <DraftEditor key={c.id} c={c} /> : <SignedView c={c} />}
      {/* [S7] */}
      <PrescriptionSection consultation={c} />
      <LettersSection consultation={c} />
      {/* [/S7] */}
      <HistoryDrawer
        fpId={c.facility_patient_id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        patientName={p.display_name}
      />
    </div>
  );
}
