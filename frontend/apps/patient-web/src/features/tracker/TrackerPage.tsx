import { connectLive, queueSockets, socketUrl, type PatientVisit } from "@medilink/api-client";
import { Alert, Button, cx, Dialog, ProgressDots, TextField, TicketNumber } from "@medilink/ui";
import { CloudSlash, MegaphoneSimple, PersonSimpleWalk } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { env } from "../../env";
import { ProfileLayout } from "../profile/ProfileLayout";

export const trackerKey = ["tracker", "visits"] as const;

/** Today's active visits, live: socket notify-then-fetch, 20 s polling as a fallback. */
export function useActiveVisits() {
  const api = useApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (env.useMocks) return;
    const live = connectLive(socketUrl(env.apiBaseUrl, queueSockets.patient), {
      onMessage: () => void queryClient.invalidateQueries({ queryKey: trackerKey }),
    });
    return () => live.close();
  }, [queryClient]);
  return useQuery({
    queryKey: trackerKey,
    queryFn: () => api.queue.patientVisits(),
    refetchInterval: 20_000,
  });
}

const STAGES = ["consultation", "payment", "pharmacy"] as const;

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Keep the screen on while the tracker is open (Wake Lock API, where supported). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    const request = () => {
      nav.wakeLock?.request("screen").then(
        (l) => (lock = l),
        () => undefined,
      );
    };
    request();
    const again = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

const time = (iso: string, lang: string) =>
  new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });

/** /visits/:visitId (design 07 §3.3): the signature screen. */
export function TrackerPage() {
  const { t, i18n } = useTranslation();
  const { visitId = "" } = useParams();
  const visits = useActiveVisits();
  const online = useOnline();
  useWakeLock();
  const visit = visits.data?.results.find((v) => v.visit_id === visitId);
  const lang = i18n.resolvedLanguage ?? "rw";

  return (
    <ProfileLayout title={t("tracker.title")} back={{ to: "/home", label: t("tracker.backHome") }}>
      {!online && visits.data && (
        <Alert tone="warning" title={t("tracker.offline")}>
          <span className="inline-flex items-center gap-2">
            <CloudSlash aria-hidden="true" />
            {t("tracker.lastUpdated", {
              time: time(visits.data.results[0]?.updated_at ?? new Date().toISOString(), lang),
            })}
          </span>
        </Alert>
      )}
      {visits.isPending && <p className="m-0 text-fg-secondary">{t("tracker.loading")}</p>}
      {visits.data && !visit && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <p className="m-0 font-heading text-h3">{t("tracker.noVisitTitle")}</p>
          <p className="m-0 text-fg-secondary">{t("tracker.noVisit")}</p>
          <Link to="/home" className="font-semibold">
            {t("tracker.backHome")}
          </Link>
        </div>
      )}
      {visit && <Tracker visit={visit} lang={lang} />}
    </ProfileLayout>
  );
}

function Tracker({ visit, lang }: { visit: PatientVisit; lang: string }) {
  const { t } = useTranslation();
  const name = visit.service_name_i18n[lang as "rw"] || visit.service_name_i18n.en;
  const called = visit.state === "called";
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const takeover = called && acknowledged !== `${visit.visit_id}-${visit.version}`;
  const stageIndex = STAGES.indexOf(visit.stage as (typeof STAGES)[number]);

  return (
    <>
      {takeover && (
        <CalledTakeover
          visit={visit}
          onAcknowledge={() => setAcknowledged(`${visit.visit_id}-${visit.version}`)}
        />
      )}
      <section
        aria-labelledby="ticket"
        className="flex flex-col items-center gap-5 rounded-lg border border-border bg-surface px-5 py-7 text-center shadow-raised"
      >
        <p className="m-0 text-fg-secondary">
          {visit.facility_name} · {name}
        </p>
        <div className="flex flex-col items-center gap-1">
          <h2 id="ticket" className="sr-only">
            {t("tracker.yourTicket")}
          </h2>
          <TicketNumber
            number={visit.ticket_number}
            size="display"
            className="text-[3.5rem] leading-none text-fg"
          />
          <span className="text-fg-secondary">{t("tracker.yourTicket")}</span>
        </div>
        {visit.state === "waiting" && (
          <div className="flex flex-col items-center gap-2" aria-live="polite">
            <ProgressDots ahead={visit.ahead} label={t("tracker.ahead", { count: visit.ahead })} />
            <p className="m-0 font-heading text-h3">{t("tracker.ahead", { count: visit.ahead })}</p>
          </div>
        )}
        {called && (
          <p
            className="m-0 rounded-md bg-warning-bg px-4 py-2 font-heading text-h3 text-warning"
            aria-live="assertive"
          >
            {t("tracker.calledTo", { room: visit.service_point ?? "" })}
          </p>
        )}
        {visit.state === "in_service" && (
          <p className="m-0 font-heading text-h3 text-brand">{t("tracker.inService")}</p>
        )}
        {visit.state === "waiting" && <WaitBlock visit={visit} lang={lang} />}
      </section>

      <section aria-labelledby="stages" className="rounded-lg border border-border bg-surface p-5">
        <h2 id="stages" className="m-0 mb-3 font-heading text-h3">
          {t("tracker.stagesTitle")}
        </h2>
        <ol className="m-0 flex list-none items-start gap-2 p-0">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <span
                className={cx(
                  "h-1.5 w-full rounded-full",
                  i < stageIndex ? "bg-primary" : i === stageIndex ? "bg-primary/60" : "bg-border",
                )}
              />
              <span
                className={cx(
                  "text-body-sm",
                  i === stageIndex ? "font-semibold text-fg" : "text-fg-secondary",
                )}
                aria-current={i === stageIndex ? "step" : undefined}
              >
                {t(`tracker.stages.${stage}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {visit.state === "waiting" && <CancelVisit visit={visit} />}
    </>
  );
}

function WaitBlock({ visit, lang }: { visit: PatientVisit; lang: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("");
  const save = useMutation({
    mutationFn: () => api.queue.setTravelTime(visit.facility_id, Number(minutes)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trackerKey }),
  });
  const est = visit.estimate;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="rounded-lg bg-brand-subtle px-4 py-3 text-on-brand-subtle">
        {est.status ? (
          <p className="m-0 font-heading text-h3">
            {t(`tracker.status.${est.status}`, { time: est.until ? time(est.until, lang) : "" })}
          </p>
        ) : (
          <p className="m-0 font-heading text-h2 tabular-nums">
            {t("tracker.wait", { min: est.min, max: est.max })}
          </p>
        )}
        {visit.leave_by && (
          <p className="m-0 mt-1 inline-flex items-center gap-2 font-semibold tabular-nums">
            <PersonSimpleWalk aria-hidden="true" />
            {t("tracker.leaveBy", { time: time(visit.leave_by, lang) })}
          </p>
        )}
      </div>
      {visit.travel_minutes === null && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (minutes) save.mutate();
          }}
          className="flex flex-wrap items-end justify-center gap-2 text-left"
        >
          <TextField
            label={t("tracker.travelLabel")}
            hint={t("tracker.travelHint")}
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-56"
          />
          <Button type="submit" variant="secondary" disabled={!minutes || save.isPending}>
            {t("tracker.travelSave")}
          </Button>
        </form>
      )}
    </div>
  );
}

function CancelVisit({ visit }: { visit: PatientVisit }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.queue.cancelVisit(visit.visit_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackerKey });
      void navigate("/home");
    },
  });
  return (
    <>
      <Button variant="ghost" size="lg" fullWidth onClick={() => setConfirming(true)}>
        {t("tracker.cancel")}
      </Button>
      {confirming && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirming(false)}
          title={t("tracker.cancelTitle")}
          description={t("tracker.cancelBody", { ticket: visit.ticket_number })}
          closeLabel={t("tracker.close")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t("tracker.keep")}
              </Button>
              <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {t("tracker.cancelConfirm")}
              </Button>
            </>
          }
        >
          {cancel.isError && (
            <Alert tone="danger" role="alert">
              {t("tracker.failed")}
            </Alert>
          )}
        </Dialog>
      )}
    </>
  );
}

/**
 * "You're called → Room 4" (design 07 §3.3, design 02 §4): the whole screen turns emerald, with a
 * sound and vibration that repeat every 30 s until the patient taps "I'm coming".
 */
function CalledTakeover({
  visit,
  onAcknowledge,
}: {
  visit: PatientVisit;
  onAcknowledge: () => void;
}) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
    const alert = () => {
      navigator.vibrate?.([400, 150, 400]);
      try {
        const context = new AudioContext();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);
        osc.connect(gain).connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + 0.8);
      } catch {
        // audio not allowed yet: vibration and the screen still tell the patient
      }
    };
    alert();
    const timer = setInterval(alert, 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="called-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-primary px-6 text-center text-on-primary"
    >
      <MegaphoneSimple
        aria-hidden="true"
        weight="fill"
        className="size-16 animate-pulse motion-reduce:animate-none"
      />
      <h2 id="called-title" className="m-0 font-heading text-display">
        {t("tracker.called")}
      </h2>
      <TicketNumber
        number={visit.ticket_number}
        size="display"
        className="text-[4rem] leading-none"
      />
      <p className="m-0 font-heading text-h1">
        {t("tracker.goTo", { room: visit.service_point ?? "" })}
      </p>
      <button
        ref={button}
        type="button"
        onClick={onAcknowledge}
        className="min-h-14 cursor-pointer rounded-lg bg-on-primary px-8 font-heading text-h3 font-bold text-primary"
      >
        {t("tracker.coming")}
      </button>
    </div>
  );
}

/** Home card: today's live ticket(s), first thing on /home (design 07 §3.1). */
export function ActiveVisitCard() {
  const { t, i18n } = useTranslation();
  const visits = useActiveVisits();
  const list = visits.data?.results ?? [];
  if (!list.length) return null;
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <section aria-labelledby="active-visits" className="flex flex-col gap-3">
      <h2 id="active-visits" className="sr-only">
        {t("tracker.homeTitle")}
      </h2>
      {list.map((v) => (
        <Link
          key={v.visit_id}
          to={`/visits/${v.visit_id}`}
          className={cx(
            "flex items-center gap-4 rounded-lg p-5 no-underline shadow-raised",
            v.state === "called" ? "bg-primary text-on-primary" : "bg-forest text-on-forest",
          )}
        >
          <TicketNumber number={v.ticket_number} size="lg" className="text-[2.25rem]" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{v.facility_name}</span>
            <span className="opacity-90">
              {v.state === "called"
                ? t("tracker.calledTo", { room: v.service_point ?? "" })
                : v.state === "waiting"
                  ? `${t("tracker.ahead", { count: v.ahead })}${v.estimate.min !== null ? ` · ${t("tracker.wait", { min: v.estimate.min, max: v.estimate.max })}` : ""}`
                  : t(`tracker.states.${v.state}`, { defaultValue: t("tracker.inService") })}
            </span>
            {v.leave_by && (
              <span className="text-body-sm opacity-90">
                {t("tracker.leaveBy", { time: time(v.leave_by, lang) })}
              </span>
            )}
          </span>
          <span className="font-semibold underline underline-offset-4">{t("tracker.open")}</span>
        </Link>
      ))}
    </section>
  );
}
