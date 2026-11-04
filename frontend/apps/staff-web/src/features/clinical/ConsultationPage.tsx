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
  buttonClassName,
  ConfirmDialog,
  cx,
  LoadingState,
  SectionAnchors,
  SwitchField,
  TextareaField,
  TextField,
  type AutosaveState,
} from "@medilink/ui";
import {
  ChatTeardropText,
  ClockCounterClockwise,
  FirstAidKit,
  Heartbeat,
  Info,
  ListChecks,
  LockKey,
  MegaphoneSimple,
  Notepad,
  PenNib,
  PlusCircle,
  SealCheck,
  ShieldWarning,
  Stethoscope,
  type Icon,
} from "@phosphor-icons/react";
import { formatTime } from "@medilink/ui/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { useStepUp } from "../lock";
import { AccessReasonPrompt } from "./AccessGate";
import { DiagnosisPicker, type PickedDiagnosis } from "./DiagnosisPicker";
import { HistoryDrawer } from "./History";
import { TemplateTools } from "./TemplateTools";
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

const SECTION_ICONS: Record<string, Icon> = {
  reason: ChatTeardropText,
  vitals: Heartbeat,
  history: ClockCounterClockwise,
  examination: Stethoscope,
  diagnosis: FirstAidKit,
  plan: ListChecks,
  instructions: Info,
  "private-notes": LockKey,
  addenda: PlusCircle,
};

function Section({
  id,
  title,
  children,
  note,
  tone = "default",
}: {
  id: string;
  title: string;
  children: ReactNode;
  note?: ReactNode;
  tone?: "default" | "private";
}) {
  const SectionIcon = SECTION_ICONS[id] ?? Notepad;
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className={cx(
        "flex scroll-mt-28 flex-col gap-4 rounded-2xl p-5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-focus",
        tone === "private" ? "bg-warning-bg/40 ring-1 ring-warning/20" : "bg-surface",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            tone === "private"
              ? "bg-warning-bg text-warning"
              : "bg-brand-subtle text-on-brand-subtle",
          )}
        >
          <SectionIcon weight="bold" className="size-[1.125rem]" />
        </span>
        <h2 id={`${id}-title`} className="m-0 font-heading text-h3 tracking-tight">
          {title}
        </h2>
      </div>
      {note}
      {children}
    </section>
  );
}

const URGENCY_TONE: Record<string, string> = {
  emergency: "bg-danger-bg text-danger",
  today: "bg-attention-bg text-attention",
  soon: "bg-info-bg text-info",
  self_care: "bg-success-bg text-success",
};

/** Why the patient came (upgrade 05 §3): their words, symptoms, and the navigation hint. */
function ReasonSection({ c }: { c: Consultation }) {
  const { t } = useTranslation();
  const r = c.reason_for_visit;
  const empty = !r.patient_words && r.symptoms.length === 0 && !r.nurse_triage;
  return (
    <Section id="reason" title={t("clinical.reasonForVisit.title")}>
      {empty ? (
        <p className="m-0 text-fg-muted">{t("clinical.reasonForVisit.none")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {r.nurse_triage && <NurseTriage triage={r.nurse_triage} />}
          {r.patient_words && (
            <blockquote className="m-0 border-s-4 border-primary/40 ps-4 text-h3 font-normal text-fg">
              “{r.patient_words}”
            </blockquote>
          )}
          {r.symptoms.length > 0 && (
            <ul
              aria-label={t("clinical.reasonForVisit.symptoms")}
              className="m-0 flex list-none flex-wrap gap-2 p-0"
            >
              {r.symptoms.map((symptom) => (
                <li
                  key={symptom.code}
                  className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-body-sm"
                >
                  <span className="font-semibold">{symptom.label}</span>
                  {symptom.duration_days !== null && (
                    <span className="text-fg-secondary tabular-nums">
                      · {t("clinical.reasonForVisit.days", { count: symptom.duration_days })}
                    </span>
                  )}
                  {symptom.severity && (
                    <span className="text-fg-secondary">
                      ·{" "}
                      {t(`clinical.reasonForVisit.severity.${symptom.severity}`, {
                        defaultValue: symptom.severity,
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {r.triage && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle/60 px-4 py-3">
              <span
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-body-sm font-semibold",
                  URGENCY_TONE[r.triage.urgency],
                )}
              >
                {t(`clinical.reasonForVisit.urgency.${r.triage.urgency}`)}
              </span>
              <span className="text-body-sm text-fg-secondary">
                {t("clinical.reasonForVisit.hint")}
              </span>
              {r.triage.red_flags.length > 0 && (
                <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-body-sm font-semibold text-danger">
                  {t("clinical.reasonForVisit.redFlags", { count: r.triage.red_flags.length })}
                </span>
              )}
              {!r.triage.signed_off && (
                <span className="ms-auto text-caption text-fg-muted">
                  {t("clinical.reasonForVisit.provisional", { version: r.triage.rules_version })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

const NURSE_TONE: Record<string, string> = {
  emergency: "border-danger bg-danger-bg",
  priority: "border-attention bg-attention-bg",
  normal: "border-border bg-subtle/60",
};

/** What the triage nurse decided (upgrade 06 §2, #200), read before the patient's words. */
function NurseTriage({
  triage,
}: {
  triage: NonNullable<Consultation["reason_for_visit"]["nurse_triage"]>;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className={cx(
        "flex flex-col gap-1 rounded-xl border-s-4 px-4 py-3",
        NURSE_TONE[triage.urgency],
      )}
    >
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="font-semibold text-fg">
          {t("clinical.reasonForVisit.nurse", {
            urgency: t(`clinical.reasonForVisit.nurseUrgency.${triage.urgency}`),
          })}
        </span>
        <span className="text-fg-secondary">
          {t("clinical.reasonForVisit.nurseBy", {
            name: triage.by_name,
            time: formatTime(triage.at, i18n.resolvedLanguage ?? "rw"),
          })}
        </span>
      </p>
      {triage.note && <p className="m-0 whitespace-pre-line text-fg">{triage.note}</p>}
    </div>
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
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-surface/90 px-4 py-2.5 shadow-raised ring-1 ring-border backdrop-blur supports-[backdrop-filter]:bg-surface/75">
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
        {c.can_edit && (
          <div className="ms-auto flex flex-wrap gap-2">
            <TemplateTools
              c={c}
              local={draft.local}
              onApply={({ sections, diagnoses }) => draft.edit({ sections, diagnoses })}
            />
          </div>
        )}
        {c.can_sign && (
          <Button
            pill
            className={c.can_edit ? undefined : "ms-auto"}
            loading={signing}
            onClick={() => void sign()}
            disabled={signing || !hasPrimary}
          >
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

      <ReasonSection c={c} />
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
        tone="private"
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
  const [openedAt] = useState(() => Date.now());
  const justSigned =
    signedOk &&
    isAuthor &&
    c.signed_at !== null &&
    openedAt - Date.parse(c.signed_at) < 15 * 60_000;
  return (
    <>
      {justSigned && (
        <div className="flex animate-rise flex-wrap items-center gap-4 rounded-2xl bg-success-bg px-5 py-4">
          <SealCheck aria-hidden="true" weight="fill" className="size-8 text-success" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="m-0 font-heading text-h3 font-semibold">{t("clinical.sign.doneTitle")}</p>
            <p className="m-0 text-body-sm text-fg-secondary">{t("clinical.sign.doneBody")}</p>
          </div>
          <Link to="/queue/mine" className={buttonClassName({ pill: true })}>
            <MegaphoneSimple aria-hidden="true" weight="bold" />
            {t("clinical.sign.backToQueue")}
          </Link>
        </div>
      )}
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
      <ReasonSection c={c} />
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
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {c.diagnoses.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-subtle/60 px-3 py-2.5"
              >
                <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-body-sm font-semibold ring-1 ring-border">
                  {d.code}
                </span>
                <span className="font-semibold">{d.plain_language || d.display}</span>
                {d.plain_language && d.plain_language !== d.display && (
                  <span className="text-body-sm text-fg-secondary">{d.display}</span>
                )}
                <span className="ms-auto flex gap-1.5">
                  <Badge tone={d.rank === "primary" ? "brand" : "neutral"}>
                    {t(`clinical.diagnosis.${d.rank}`)}
                  </Badge>
                  <Badge tone={d.certainty === "confirmed" ? "success" : "warning"}>
                    {t(`clinical.diagnosis.${d.certainty}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          text("")
        )}
      </Section>
      <Section
        id="private-notes"
        tone="private"
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
              <li key={a.id} className="rounded-2xl border border-border/60 p-3">
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
    { id: "reason", label: t("clinical.reasonForVisit.short") },
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
    <div className="flex max-w-5xl flex-col gap-5">
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
          <>
            <Button variant="secondary" pill onClick={() => setHistoryOpen(true)}>
              <ClockCounterClockwise aria-hidden="true" className="size-icon" />
              {t("clinical.history.open")}
            </Button>
            <Link to="/queue/mine" className={buttonClassName({ variant: "ghost", pill: true })}>
              <MegaphoneSimple aria-hidden="true" />
              {t("clinical.toQueue")}
            </Link>
          </>
        }
      />
      <AllergyBanner
        allergies={allergyItems(c.allergies)}
        noKnownAllergies={c.no_known_allergies}
        title={t("clinical.allergy.title")}
        noneLabel={t("clinical.allergy.none")}
        unknownLabel={t("clinical.allergy.unknown")}
      />
      <SectionAnchors
        sections={sections}
        label={t("clinical.sections.nav")}
        className="rounded-2xl bg-surface p-1 shadow-card"
      />
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
