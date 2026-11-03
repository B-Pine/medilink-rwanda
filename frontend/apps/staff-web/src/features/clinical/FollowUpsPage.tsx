import type { FollowUpState, MyFollowUp } from "@medilink/api-client";
import { Alert, Badge, buttonClassName, cx, EmptyState, Skeleton } from "@medilink/ui";
import { formatTime } from "@medilink/ui/i18n";
import { BellRinging, CalendarCheck, ClockCounterClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, useCan, useWhen } from "./shared";

const STATES: FollowUpState[] = ["missed", "today", "upcoming", "attended"];
const TONE: Record<FollowUpState, "danger" | "warning" | "info" | "success"> = {
  missed: "danger",
  today: "warning",
  upcoming: "info",
  attended: "success",
};

/** /clinical/follow-ups (upgrade 05 §3): the patients I asked to come back. */
export function FollowUpsPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const lang = (i18n.resolvedLanguage ?? "en") as "rw" | "en" | "fr";
  const allowed = useCan("clinical.write");
  const [state, setState] = useState<FollowUpState>("today");
  const list = useQuery({
    queryKey: ["clinical", "my-follow-ups"],
    queryFn: () => api.clinical.myFollowUps(),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data ?? [];
  const count = (s: FollowUpState) => rows.filter((r) => r.state === s).length;
  const shown = rows.filter((r) => r.state === state);
  const due = (r: MyFollowUp) =>
    r.booking_starts_at
      ? `${when.date(r.due_on)} · ${formatTime(r.booking_starts_at, lang)}`
      : when.date(r.due_on);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("clinical.followUps.title")}
        description={t("clinical.followUps.intro")}
      />
      <div
        role="group"
        aria-label={t("clinical.followUps.title")}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={state === s}
            onClick={() => setState(s)}
            className={cx(
              "flex cursor-pointer flex-col items-start gap-1 rounded-2xl bg-surface p-4 text-left shadow-card",
              "ring-2 ring-transparent transition-[box-shadow,transform] duration-200 ease-out-quint hover:-translate-y-0.5",
              "aria-pressed:ring-primary",
            )}
          >
            <span className="text-body-sm font-semibold text-fg-secondary">
              {t(`clinical.followUps.state.${s}`)}
            </span>
            <span
              className={cx(
                "font-heading text-h1 leading-none font-semibold tabular-nums",
                s === "missed" && count(s) > 0 && "text-danger",
              )}
            >
              {list.data ? count(s) : "—"}
            </span>
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Skeleton height="12rem" className="rounded-2xl" />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={t(`clinical.followUps.empty.${state}`)}
          description={t("clinical.followUps.emptyBody")}
        />
      ) : (
        <div className="animate-enter overflow-x-auto rounded-2xl bg-surface shadow-card">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t(`clinical.followUps.state.${state}`)}</caption>
            <thead className="border-b border-border text-caption font-semibold tracking-wide text-fg-secondary uppercase">
              <tr>
                {["patient", "service", "due", "how", "action"].map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={cx("px-4 py-3 font-semibold", c === "action" && "text-right")}
                  >
                    {t(`clinical.followUps.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <tr key={r.id} className="transition-colors duration-150 hover:bg-subtle/60">
                  <td className="px-4 py-3 font-semibold">{r.patient_display_name}</td>
                  <td className="px-4 py-3 text-body-sm text-fg-secondary">
                    {r.service_name_i18n[lang] || r.service_name_i18n.en}
                  </td>
                  <td className="px-4 py-3 text-body-sm whitespace-nowrap tabular-nums">
                    {due(r)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={TONE[r.state]}
                      icon={r.mode === "booking" ? CalendarCheck : BellRinging}
                    >
                      {t(`clinical.followUps.mode.${r.mode}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/clinical/patients/${r.facility_patient_id}/history`}
                      aria-label={`${t("clinical.followUps.history")}: ${r.patient_display_name}`}
                      className={buttonClassName({ variant: "secondary", pill: true })}
                    >
                      <ClockCounterClockwise aria-hidden="true" />
                      {t("clinical.followUps.history")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
