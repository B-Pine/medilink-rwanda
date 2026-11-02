import {
  connectLive,
  isApiError,
  queueSockets,
  socketUrl,
  type PatientVisit,
} from "@medilink/api-client";
import { Alert, Button, cx, Dialog, ProgressDots, TextField, TicketNumber } from "@medilink/ui";
import { formatTime } from "@medilink/ui/i18n";
import {
  Check,
  CloudSlash,
  MapPin,
  MegaphoneSimple,
  PersonSimpleWalk,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { env } from "../../env";
import { PageHeader, panelClass } from "../dashboard/kit";

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
/**
 * `queue.pass_over_places` (contract sprint-05 §2.2): a remote ticket that reception has not
 * confirmed moves back when it comes this close to the front.
 */
export const PASS_OVER_PLACES = 5;

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

const time = (iso: string, lang: string) => formatTime(iso, lang);

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
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t("tracker.title")}
        back={{ to: paths.queue, label: t("dashboard.queue.back") }}
      />
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
        <div className={cx(panelClass, "flex max-w-[40rem] flex-col gap-3 p-5")}>
          <p className="m-0 font-heading text-h3">{t("tracker.noVisitTitle")}</p>
          <p className="m-0 text-fg-secondary">{t("tracker.noVisit")}</p>
          <Link to={paths.queue} className="font-semibold">
            {t("dashboard.queue.back")}
          </Link>
        </div>
      )}
      {visit && <Tracker visit={visit} lang={lang} />}
    </div>
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
    // the ticket and what to do now on the left; the visit's steps and the exits beside it
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {takeover && (
        <CalledTakeover
          visit={visit}
          onAcknowledge={() => setAcknowledged(`${visit.visit_id}-${visit.version}`)}
        />
      )}
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="ticket"
          className={cx(
            panelClass,
            "flex flex-col items-center gap-5 px-5 py-8 text-center shadow-card sm:px-8",
            called && "border-attention-solid",
          )}
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
              stub
              tone={visit.state === "called" ? "attention" : "brand"}
            />
            <span className="text-fg-secondary">{t("tracker.yourTicket")}</span>
          </div>
          {visit.state === "waiting" && (
            <div className="flex flex-col items-center gap-2" aria-live="polite">
              <ProgressDots
                ahead={visit.ahead}
                label={t("tracker.ahead", { count: visit.ahead })}
              />
              <p className="m-0 font-heading text-h3">
                {t("tracker.ahead", { count: visit.ahead })}
              </p>
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

        {visit.is_remote && !visit.remote_arrival_confirmed_at && visit.state === "waiting" && (
          <RemoteArrival visit={visit} />
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <section aria-labelledby="stages" className={cx(panelClass, "overflow-hidden")}>
          <h2
            id="stages"
            className="m-0 border-b border-border px-5 py-4 font-heading text-body font-bold"
          >
            {t("tracker.stagesTitle")}
          </h2>
          <ol className="m-0 flex list-none flex-col p-5">
            {STAGES.map((stage, i) => {
              const done = i < stageIndex;
              const current = i === stageIndex;
              return (
                <li
                  key={stage}
                  aria-current={current ? "step" : undefined}
                  className="relative flex items-center gap-3 pb-5 last:pb-0"
                >
                  {i < STAGES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        "absolute top-7 left-[0.6875rem] h-[calc(100%-1.75rem)] w-px",
                        done ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cx(
                      "relative grid size-6 shrink-0 place-items-center rounded-full border-2 text-caption font-bold tabular-nums",
                      done && "border-primary bg-primary text-on-primary",
                      current && "border-primary bg-brand-subtle text-on-brand-subtle",
                      !done && !current && "border-border bg-surface text-fg-muted",
                    )}
                  >
                    {done ? <Check weight="bold" className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={cx(
                      "text-body-sm",
                      current ? "font-semibold text-fg" : "text-fg-secondary",
                    )}
                  >
                    {t(`tracker.stages.${stage}`)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {visit.state === "waiting" && <CancelVisit visit={visit} />}
      </aside>
    </div>
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

/**
 * Remote joiners (design 07 §3.3 "I'm here – check in"; decision 2026-10-31): "I'm here" only
 * tells reception the patient says they arrived. Reception confirms the arrival; until then the
 * pass-over rule applies, so the banner warns near the front of the queue.
 */
function RemoteArrival({ visit }: { visit: PatientVisit }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const claimed = Boolean(visit.remote_arrival_claimed_at);
  const here = useMutation({
    mutationFn: () => api.booking.arrived(visit.visit_id),
    onSuccess: (updated) => {
      queryClient.setQueryData<{ results: PatientVisit[] }>(trackerKey, (old) =>
        old
          ? { results: old.results.map((v) => (v.visit_id === updated.visit_id ? updated : v)) }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: trackerKey });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409)
        void queryClient.invalidateQueries({ queryKey: trackerKey });
    },
  });
  const nearFront = visit.ahead <= PASS_OVER_PLACES;

  return (
    <section aria-labelledby="remote-arrival" className={cx(panelClass, "flex flex-col gap-3 p-5")}>
      <h2 id="remote-arrival" className="m-0 flex items-center gap-2 font-heading text-h3">
        <MapPin aria-hidden="true" className="size-5 text-brand" />
        {t("tracker.remote.title")}
      </h2>
      {nearFront && (
        <Alert tone="warning" title={t("tracker.remote.passOverTitle")}>
          {claimed ? t("tracker.remote.passOverClaimed") : t("tracker.remote.passOver")}
        </Alert>
      )}
      {claimed ? (
        <p className="m-0 text-fg-secondary" role="status">
          {t("tracker.remote.claimed")}
        </p>
      ) : (
        <>
          <p className="m-0 text-fg-secondary">{t("tracker.remote.body")}</p>
          <Button size="lg" fullWidth loading={here.isPending} onClick={() => here.mutate()}>
            {t("tracker.remote.here")}
          </Button>
        </>
      )}
      {here.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(here.error) && here.error.status === 409
            ? t("tracker.remote.changed")
            : t("tracker.failed")}
        </Alert>
      )}
    </section>
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
      void navigate(paths.queue);
    },
  });
  return (
    <>
      <Button variant="ghost" fullWidth onClick={() => setConfirming(true)} className="text-danger">
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
    // One AudioContext for the whole takeover (browsers limit how many a page may open)
    let context: AudioContext | null = null;
    const alert = () => {
      navigator.vibrate?.([400, 150, 400]);
      try {
        context ??= new AudioContext();
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
    return () => {
      clearInterval(timer);
      void context?.close().catch(() => undefined);
    };
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
