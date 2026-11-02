import { formatTime } from "@medilink/ui/i18n";
import {
  connectLive,
  isApiError,
  queueSockets,
  socketUrl,
  type DisplayBoard,
} from "@medilink/api-client";
import { cx, ImigongoPattern, Logo, TicketNumber } from "@medilink/ui";
import { ArrowRight, SpeakerHigh } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useApi } from "../../app/services";
import { env } from "../../env";

/** A short two-tone chime (Web Audio; no file to download). */
function chime(context: AudioContext) {
  const t0 = context.currentTime;
  for (const [freq, start] of [
    [880, 0],
    [660, 0.22],
  ] as const) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.5);
    osc.connect(gain).connect(context.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + 0.55);
  }
}

/**
 * Spoken call (upgrade 08, proposed FR-QUE-21): the number and room read aloud after the chime with
 * the browser's own voice for the display language. Recorded Kinyarwanda voice files are open
 * decision OD-4; where no voice exists the chime alone plays.
 */
function speak(number: string, room: string | null, language: string, template: string) {
  if (!("speechSynthesis" in window)) return;
  const spelled = number.replace("-", " ").split("").join(" ");
  const utterance = new SpeechSynthesisUtterance(
    template.replace("{{number}}", spelled).replace("{{room}}", room ?? ""),
  );
  utterance.lang = language === "rw" ? "rw-RW" : language === "fr" ? "fr-FR" : "en-GB";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * /display/:token (design 04 §3.6): full-screen deep forest board. Ticket numbers and rooms only,
 * never names. A new call highlights for 1.5 s and chimes once sound is enabled (browsers need one
 * tap before playing audio).
 */
export function DisplayPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const api = useApi();
  const board = useQuery({
    queryKey: ["display", token],
    queryFn: () => api.queue.display(token),
    refetchInterval: 15_000,
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 3,
  });
  const audio = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const now = useClock();
  const lang = (i18n.resolvedLanguage ?? "rw") as "rw" | "en" | "fr";

  useEffect(() => {
    if (env.useMocks || !token) return;
    const live = connectLive(socketUrl(env.apiBaseUrl, queueSockets.display(token)), {
      onMessage: () => void board.refetch(),
    });
    return () => live.close();
    // board.refetch is stable for the query's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const data: DisplayBoard | undefined = board.data;
    if (!data) return;
    const called = data.services.flatMap((s) =>
      s.now_serving.filter((n) => n.state === "called").map((n) => n.number),
    );
    if (seen.current) {
      const fresh = called.find((n) => !seen.current!.has(n));
      if (fresh) {
        setFlash(fresh);
        if (soundOn && audio.current) {
          chime(audio.current);
          const room =
            data.services.flatMap((s) => s.now_serving).find((n) => n.number === fresh)
              ?.service_point ?? null;
          const template = t(room ? "queue.display.spokenRoom" : "queue.display.spoken");
          setTimeout(() => speak(fresh, room, lang, template), 900);
        }
        const timer = setTimeout(() => setFlash(null), 1500);
        seen.current = new Set(called);
        return () => clearTimeout(timer);
      }
    }
    seen.current = new Set(called);
    // t and lang only shape the spoken sentence; a language change must not replay a call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.data, soundOn]);

  const enableSound = () => {
    audio.current ??= new AudioContext();
    void audio.current.resume();
    setSoundOn(true);
  };

  if (board.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-forest p-8 text-center text-on-forest">
        <p className="m-0 text-h2">{t("queue.display.invalid")}</p>
      </main>
    );
  }
  const data = board.data;
  return (
    <main className="relative isolate flex min-h-dvh flex-col bg-forest text-on-forest">
      <div aria-hidden="true" className="absolute inset-0 -z-10 text-on-forest-accent">
        <ImigongoPattern opacity={0.05} />
      </div>
      <header className="flex items-center justify-between gap-6 border-b border-forest-raised px-[3vw] py-[2vh]">
        <div className="flex items-center gap-4">
          <Logo tone="onDark" className="h-[5vh]" />
          <h1 className="m-0 font-heading text-[3.2vh] font-bold tracking-wide">
            {data?.facility_name}
          </h1>
        </div>
        <div className="flex items-center gap-6">
          {!soundOn && (
            <button
              type="button"
              onClick={enableSound}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-on-forest/10 px-5 py-2.5 font-semibold text-on-forest ring-1 ring-on-forest/20 transition-colors duration-200 ease-out-quint hover:bg-on-forest/20"
            >
              <SpeakerHigh aria-hidden="true" />
              {t("queue.display.enableSound")}
            </button>
          )}
          <p className="m-0 font-heading text-[4vh] font-bold tabular-nums">
            {formatTime(now, lang)}
          </p>
        </div>
      </header>
      <div className="grid flex-1 gap-[2vw] p-[3vw] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="serving" className="flex flex-col gap-[2vh]">
          <h2
            id="serving"
            className="m-0 text-[2.6vh] font-semibold tracking-wide text-on-forest-muted"
          >
            {t("queue.display.nowServing")}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-[1.5vh] p-0" aria-live="polite">
            {(data?.services ?? [])
              .flatMap((s) => s.now_serving)
              .slice(0, 4)
              .map((n, index) => (
                <li
                  key={n.number}
                  className={cx(
                    "flex animate-rise items-center justify-between gap-[2vw] rounded-[2.5vh] px-[2.4vw] transition-colors duration-700 motion-reduce:transition-none",
                    index === 0 ? "py-[2.6vh] shadow-raised" : "py-[1.4vh]",
                    flash === n.number
                      ? "bg-on-forest-accent text-forest"
                      : index === 0
                        ? "bg-on-forest/12 ring-1 ring-on-forest/20"
                        : "bg-on-forest/6",
                  )}
                >
                  <TicketNumber
                    number={n.number}
                    size="display"
                    className={cx("leading-none", index === 0 ? "text-[13vh]" : "text-[8vh]")}
                  />
                  <span
                    className={cx(
                      "flex items-center gap-[1vw] font-heading font-bold",
                      index === 0 ? "text-[6vh]" : "text-[4vh]",
                    )}
                  >
                    <ArrowRight aria-hidden="true" weight="bold" />
                    {n.service_point ?? "—"}
                  </span>
                </li>
              ))}
          </ul>
        </section>
        <section aria-labelledby="next" className="flex flex-col gap-[2vh]">
          <h2
            id="next"
            className="m-0 text-[2.6vh] font-semibold tracking-wide text-on-forest-muted"
          >
            {t("queue.display.next")}
          </h2>
          {(data?.services ?? []).map((s) => (
            <div key={s.service_id} className="flex flex-col gap-[1vh]">
              <p className="m-0 text-[2.4vh] font-semibold text-on-forest-accent">
                {s.name_i18n[lang] || s.name_i18n.en}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-[1vw] p-0">
                {s.next.map((number) => (
                  <li
                    key={number}
                    className="animate-enter rounded-full bg-on-forest/8 px-[1.6vw] py-[0.6vh] ring-1 ring-on-forest/15"
                  >
                    <TicketNumber number={number} className="text-[4.5vh]" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
      <footer className="border-t border-forest-raised px-[3vw] py-[1.5vh] text-[2.2vh] text-on-forest-muted">
        {t("queue.display.footer")}
      </footer>
    </main>
  );
}
