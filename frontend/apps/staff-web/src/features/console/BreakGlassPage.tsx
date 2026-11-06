import { isApiError, type BreakGlassSession } from "@medilink/api-client";
import { Alert, Button, EmptyState, LoadingState, TextField } from "@medilink/ui";
import { CheckCircle, Clock, Siren, XCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock/StepUp";
import { Avatar, useDateTime, useRelative } from "./shared";

/**
 * Break-glass reviews (S6 G1/G2, upgrade 05 §6): every emergency access to a record, waiting for a
 * second admin to judge it appropriate or not. Shows who, where, why and for how long; never the
 * patient's health data.
 */
export function BreakGlassPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [tab, setTab] = useState<"review" | "all">("review");
  const sessions = useQuery({
    queryKey: ["console", "break-glass", tab],
    queryFn: () => api.console.breakGlass({ needs_review: tab === "review" ? true : undefined }),
  });
  const rows = sessions.data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("console.bg.title")} />
      <div className="inline-flex gap-1 self-start rounded-full bg-subtle p-1">
        {(["review", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 ease-out-quint hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
          >
            {t(`console.bg.tab.${key}`)}
          </button>
        ))}
      </div>
      {sessions.isPending ? (
        <LoadingState />
      ) : sessions.isError ? (
        <Alert tone="danger">{t("console.failed")}</Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={Siren} title={t("console.bg.none")} />
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
          {rows.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionCard({ session: s }: { session: BreakGlassSession }) {
  const { t } = useTranslation();
  const api = useApi();
  const relative = useRelative();
  const dateTime = useDateTime();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: (outcome: "appropriate" | "inappropriate") =>
      withStepUp(() => api.console.reviewBreakGlass(s.id, { outcome, note: note.trim() })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["console"] }),
  });
  const minutes = Math.round(
    (Date.parse(s.ended_at ?? s.expires_at) - Date.parse(s.starts_at)) / 60_000,
  );

  return (
    <li className="flex animate-enter flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={s.user_name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{s.user_name}</span>
          <span className="text-body-sm text-fg-secondary">{s.facility_name}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-0.5 text-caption font-semibold text-danger">
          <Siren aria-hidden="true" weight="bold" className="size-3.5" />
          {t(`console.bg.reason.${s.reason_code}`, { defaultValue: s.reason_code })}
        </span>
      </div>
      <blockquote className="m-0 rounded-xl bg-page px-4 py-3 text-fg">{s.reason_text}</blockquote>
      <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-fg-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden="true" className="size-4" />
          {dateTime(s.starts_at)}
        </span>
        <span>{t("console.bg.duration", { minutes })}</span>
        <span className="text-fg-muted">{relative(s.starts_at)}</span>
      </p>
      {s.reviewed_at ? (
        <p
          className={
            s.review_outcome === "appropriate"
              ? "m-0 inline-flex items-center gap-2 font-semibold text-success"
              : "m-0 inline-flex items-center gap-2 font-semibold text-danger"
          }
        >
          {s.review_outcome === "appropriate" ? (
            <CheckCircle aria-hidden="true" weight="fill" className="size-5" />
          ) : (
            <XCircle aria-hidden="true" weight="fill" className="size-5" />
          )}
          {t(`console.bg.outcome.${s.review_outcome}`, { defaultValue: s.review_outcome })} ·{" "}
          {s.reviewed_by_name}
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
          {review.isError && (
            <Alert tone="danger">
              {isApiError(review.error) ? review.error.message : t("console.failed")}
            </Alert>
          )}
          <TextField
            label={t("console.bg.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              pill
              loading={review.isPending}
              onClick={() => review.mutate("appropriate")}
              iconStart={<CheckCircle aria-hidden="true" weight="bold" className="size-4" />}
            >
              {t("console.bg.appropriate")}
            </Button>
            <Button
              pill
              variant="danger"
              disabled={note.trim().length < 5}
              onClick={() => review.mutate("inappropriate")}
              iconStart={<XCircle aria-hidden="true" weight="bold" className="size-4" />}
            >
              {t("console.bg.inappropriate")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
