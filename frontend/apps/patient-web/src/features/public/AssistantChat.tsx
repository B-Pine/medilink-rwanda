import { isApiError, type AssistantLanguage, type AssistantTurn } from "@medilink/api-client";
import {
  ArrowClockwise,
  ArrowRight,
  PaperPlaneRight,
  ShieldWarning,
  Stethoscope,
} from "@phosphor-icons/react";
import { Alert, Button, buttonClassName, cx, Skeleton } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { FacilityCardGrid } from "../site/FacilityCards";
import { MAX_MESSAGE, type AssistantChat, type AssistantMessage } from "./assistantState";
import { EmergencyAnswer } from "./SymptomCheckerPage";

/* Views of the AI symptom assistant chat (issue #159), for the /assistant page and the panel. */

/** Test phase and privacy, said before anything is typed. */
export function AssistantNotice({
  language,
  compact = false,
}: {
  language: AssistantLanguage;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(
        "flex items-start gap-3 border border-attention-solid/30 bg-attention-bg text-body-sm text-fg",
        compact ? "rounded-xl p-3" : "rounded-2xl p-4",
      )}
    >
      <ShieldWarning
        aria-hidden="true"
        weight="fill"
        className="mt-0.5 size-5 shrink-0 text-attention"
      />
      <div className="flex flex-col gap-1">
        <p className="m-0 font-semibold">{t("public.assistant.testTitle")}</p>
        <p className="m-0">{t("public.assistant.testBody")}</p>
        {language === "rw" && (
          <p className="m-0 font-semibold">{t("public.assistant.kinyarwanda")}</p>
        )}
      </div>
    </div>
  );
}

/** The messages, then the emergency card or the answer with places, or what went wrong. */
export function AssistantThread({
  chat,
  compact = false,
}: {
  chat: AssistantChat;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { messages, last, turn } = chat;
  const end = useRef<HTMLDivElement>(null);
  const unavailable =
    turn.isError && isApiError(turn.error) && turn.error.code === "assistant_unavailable";

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, turn.isPending, last]);

  return (
    <div className="flex flex-col gap-3">
      <ol
        aria-live="polite"
        aria-label={t("public.assistant.conversation")}
        className="m-0 flex list-none flex-col gap-3 p-0"
      >
        <Bubble from="assistant" text={t("public.assistant.greeting")} />
        {messages.map((m) => (
          <Bubble key={m.id} from={m.from} text={m.text} />
        ))}
        {turn.isPending && (
          <li className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md bg-subtle px-4 py-3">
            <span className="sr-only">{t("public.assistant.thinking")}</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="size-2 animate-bounce rounded-full bg-fg-muted motion-reduce:animate-none"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </li>
        )}
      </ol>

      {last?.kind === "emergency" && <EmergencyAnswer />}
      {last?.kind === "answer" && <AnswerCard turn={last} compact={compact} />}

      {turn.isError && (
        <Alert tone={unavailable ? "warning" : "danger"} role="alert">
          {unavailable ? t("public.assistant.unavailable") : t("public.assistant.failed")}{" "}
          <Link to="/check-symptoms" className="font-semibold">
            {t("public.assistant.useChecker")}
          </Link>
        </Alert>
      )}
      <div ref={end} />
    </div>
  );
}

/** Quick yes / no answers and the message box; "Start again" once the chat has ended. */
export function AssistantComposer({ chat }: { chat: AssistantChat }) {
  const { t } = useTranslation();
  const id = useId();
  const { last, turn, done, text, setText, send, restart, input } = chat;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(text);
  };

  if (done)
    return (
      <Button
        variant="secondary"
        pill
        className="self-start"
        onClick={restart}
        iconStart={<ArrowClockwise aria-hidden="true" className="size-4" />}
      >
        {t("public.assistant.restart")}
      </Button>
    );

  return (
    <div className="flex w-full flex-col gap-2">
      {last?.kind === "question" && !turn.isPending && (
        <div role="group" aria-label={t("public.assistant.quick")} className="flex flex-wrap gap-2">
          {(["yes", "no", "notSure"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => send(t(`public.assistant.answers.${key}`))}
              className="min-h-target cursor-pointer rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg transition-colors duration-150 hover:border-primary hover:bg-brand-subtle hover:text-on-brand-subtle"
            >
              {t(`public.assistant.answers.${key}`)}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {t("public.assistant.label")}
        </label>
        <textarea
          id={id}
          ref={input}
          rows={2}
          maxLength={MAX_MESSAGE}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(text);
            }
          }}
          placeholder={t("public.assistant.placeholder")}
          className="min-h-12 flex-1 resize-none rounded-2xl border border-border-input bg-page px-4 py-3 text-body text-fg placeholder:text-fg-muted focus:border-primary"
        />
        <Button
          type="submit"
          pill
          disabled={!text.trim() || turn.isPending}
          aria-label={t("public.assistant.send")}
          className="size-12 shrink-0 px-0"
        >
          <PaperPlaneRight aria-hidden="true" weight="fill" className="size-5" />
        </Button>
      </form>
      <p className="m-0 text-caption text-fg-muted">{t("public.assistant.notName")}</p>
    </div>
  );
}

function Bubble({ from, text }: { from: AssistantMessage["from"]; text: string }) {
  const mine = from === "person";
  return (
    <li
      className={cx(
        "max-w-[85%] animate-rise rounded-2xl px-4 py-3 text-body whitespace-pre-line",
        mine
          ? "self-end rounded-br-md bg-primary text-on-primary"
          : "self-start rounded-bl-md bg-subtle text-fg",
      )}
    >
      {text}
    </li>
  );
}

/** The answer: the possible cause (when named), how soon, and facilities offering the service. */
function AnswerCard({ turn, compact }: { turn: AssistantTurn; compact: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const service = turn.service_code ?? "general_consultation";
  const places = useQuery({
    queryKey: ["discovery", "assistant", service],
    queryFn: () => api.booking.search({ service_code: service }),
  });
  const rows = (places.data?.results ?? []).slice(0, compact ? 2 : 4);
  return (
    <div className="flex animate-rise flex-col gap-4 rounded-2xl border border-brand/25 bg-brand-subtle/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-body-sm font-semibold text-on-brand-subtle">
          <Stethoscope aria-hidden="true" className="size-4" />
          {t(`public.assistant.urgency.${turn.urgency ?? "today"}`)}
        </span>
        {turn.named && turn.condition && (
          <span className="rounded-full bg-surface px-3 py-1 text-body-sm text-fg-secondary">
            {t("public.assistant.possible", { condition: turn.condition })}
          </span>
        )}
      </div>
      <p className="m-0 text-body-sm text-fg-secondary">{t("public.assistant.notDiagnosis")}</p>
      <h2 className="m-0 font-heading text-h3 font-bold">{t("public.assistant.placesTitle")}</h2>
      {places.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : rows.length ? (
        <FacilityCardGrid
          label={t("public.assistant.placesTitle")}
          rows={rows}
          loading={false}
          stack={compact}
        />
      ) : (
        <p className="m-0 text-fg-secondary">{t("public.assistant.noPlaces")}</p>
      )}
      <Link
        to={`/find-care?service=${encodeURIComponent(service)}`}
        viewTransition
        className={buttonClassName({ pill: true, className: "group self-start" })}
      >
        {t("public.assistant.morePlaces")}
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}
