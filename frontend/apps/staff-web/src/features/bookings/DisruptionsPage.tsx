import {
  isApiError,
  type DisruptionAction,
  type DisruptionDetail,
  type DisruptionItem,
  type DisruptionKind,
  type PatientResponse,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  EmptyState,
  SelectField,
  Skeleton,
  Stepper,
  TextareaField,
  TextField,
  type BadgeTone,
} from "@medilink/ui";
import { CalendarX, DoorOpen, type Icon, Phone, Plus, UserMinus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { SetupGate, useLocalName } from "../setup/shared";
import { calendarKeys } from "./CalendarPage";
import { kigaliDate, slotDay, slotTime, text } from "./time";

const ACTIONS: DisruptionAction[] = ["move_doctor", "next_slot", "cancel"];
const KINDS: DisruptionKind[] = ["doctor_absent", "closure", "schedule_change"];

export const disruptionKeys = {
  all: ["bookings", "disruptions"] as const,
  list: ["bookings", "disruptions", "list"] as const,
  one: (id: string) => ["bookings", "disruptions", id] as const,
};

const KIND_ICON: Record<DisruptionKind, Icon> = {
  doctor_absent: UserMinus,
  closure: DoorOpen,
  schedule_change: CalendarX,
};

const RESPONSE_TONE: Record<PatientResponse, BadgeTone> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  rebooked_other: "info",
  cancelled: "neutral",
};

/** A `datetime-local` value is Kigali wall time (UTC+2, no daylight saving). */
const kigaliIso = (local: string) => new Date(`${local}:00+02:00`).toISOString();

function useWhen() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (iso: string) =>
    `${slotDay(kigaliDate(new Date(iso)), lang, "full")} ${slotTime(iso, lang)}`;
}

/** /disruptions (contract S5 §6.2, R7): open disruptions, and the wizard to make one. */
export function DisruptionsPage() {
  return (
    <SetupGate codes={["schedule.manage"]}>
      <Disruptions />
    </SetupGate>
  );
}

/** /disruptions/:id: the affected list, actions and patient answers. */
export function DisruptionPage() {
  const { id = "" } = useParams();
  return (
    <SetupGate codes={["schedule.manage"]}>
      <Wizard initialId={id} />
    </SetupGate>
  );
}

function Disruptions() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: disruptionKeys.list,
    queryFn: () => api.booking.staff.disruptions(),
  });
  if (creating) return <Wizard initialId="" onCancel={() => setCreating(false)} />;
  const rows = list.data?.results ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("bookings.disruptions.title")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {t("bookings.disruptions.new")}
          </Button>
        }
      />
      {list.isPending ? (
        <Skeleton height="8rem" className="rounded-2xl" />
      ) : list.isError ? (
        <Alert tone="danger" role="alert" title={t("bookings.disruptions.failed")}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("bookings.slot.retry")}
          </Button>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={t("bookings.disruptions.noneTitle")}
          description={t("bookings.disruptions.none")}
        />
      ) : (
        <ul
          aria-label={t("bookings.disruptions.title")}
          className="ml-stagger m-0 grid list-none gap-3 p-0 lg:grid-cols-2"
        >
          {rows.map((d) => {
            const KindIcon = KIND_ICON[d.kind];
            const c = d.counts;
            const handled = c.accepted + c.declined + c.rebooked_other + c.cancelled;
            const share = c.total ? Math.round((100 * handled) / c.total) : 100;
            return (
              <li key={d.id}>
                <Link
                  to={`/disruptions/${d.id}`}
                  className="group flex h-full flex-col gap-4 rounded-2xl bg-surface p-5 text-fg no-underline shadow-card transition-[box-shadow,transform] duration-200 ease-out-quint hover:-translate-y-0.5 hover:shadow-raised"
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={cx(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        d.status === "open"
                          ? "bg-attention-bg text-attention"
                          : "bg-success-bg text-success",
                      )}
                    >
                      <KindIcon aria-hidden="true" weight="bold" className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">
                        {t(`bookings.disruptions.kind.${d.kind}`)}
                        {d.doctor ? ` · ${d.doctor}` : ""}
                      </span>
                      <span className="text-body-sm text-fg-secondary tabular-nums">
                        {when(d.starts_at)} – {when(d.ends_at)}
                      </span>
                    </span>
                    <Badge tone={d.status === "open" ? "warning" : "success"}>
                      {t(`bookings.disruptions.status.${d.status}`)}
                    </Badge>
                  </span>
                  {d.reason && (
                    <span className="line-clamp-2 text-body-sm text-fg-secondary">{d.reason}</span>
                  )}
                  <span className="mt-auto flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2 text-body-sm">
                      <span className="text-fg-secondary">
                        {t("bookings.disruptions.summary", {
                          total: c.total,
                          pending: c.pending + c.not_applied,
                        })}
                      </span>
                      <span className="font-semibold tabular-nums">{share}%</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-subtle"
                    >
                      <span
                        className={cx(
                          "block h-full rounded-full transition-[width] duration-500 ease-out-quint",
                          share === 100 ? "bg-success" : "bg-brand",
                        )}
                        style={{ width: `${share}%` }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Wizard({ initialId, onCancel }: { initialId: string; onCancel?: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [id, setId] = useState(initialId);
  const [answers, setAnswers] = useState(false);
  const detail = useQuery({
    queryKey: disruptionKeys.one(id),
    queryFn: () => api.booking.staff.disruption(id),
    enabled: Boolean(id),
  });
  const data = detail.data;
  const unapplied = (data?.items ?? []).filter((i) => i.action === null && i.resolved_at === null);
  const step = !id ? 0 : answers || (data && unapplied.length === 0) ? 2 : 1;
  const labels = [
    t("bookings.disruptions.steps.what"),
    t("bookings.disruptions.steps.affected"),
    t("bookings.disruptions.steps.answers"),
  ];
  const created = (out: DisruptionDetail) => {
    queryClient.setQueryData(disruptionKeys.one(out.disruption.id), out);
    void queryClient.invalidateQueries({ queryKey: disruptionKeys.list });
    void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    setId(out.disruption.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("bookings.disruptions.wizardTitle")}
        back={{ to: "/disruptions", label: t("bookings.disruptions.back") }}
      />
      <Stepper
        label={t("bookings.disruptions.progress")}
        steps={labels.map((label, i) => ({
          id: String(i),
          label,
          state: i < step ? "complete" : i === step ? "current" : "upcoming",
        }))}
      />
      <p className="m-0 text-fg-secondary">
        {t("bookings.steps.progress", { step: step + 1, total: 3 })}
      </p>
      {step === 0 && (
        <WhatStep
          onCreated={created}
          onCancel={() => (onCancel ? onCancel() : void navigate("/disruptions"))}
        />
      )}
      {id && detail.isPending && <Skeleton height="10rem" className="rounded-2xl" />}
      {id && detail.isError && (
        <Alert tone="danger" role="alert" title={t("bookings.disruptions.failed")} />
      )}
      {data && step === 1 && <AffectedStep data={data} onApplied={() => setAnswers(true)} />}
      {data && step === 2 && <AnswersStep data={data} />}
    </div>
  );
}

function WhatStep({
  onCreated,
  onCancel,
}: {
  onCreated: (out: DisruptionDetail) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const [kind, setKind] = useState<DisruptionKind>("doctor_absent");
  const options = useQuery({
    queryKey: calendarKeys.view({ purpose: "disruption" }),
    queryFn: () => api.booking.staff.calendar({ view: "week" }),
  });
  const create = useMutation({
    mutationFn: (form: FormData) =>
      api.booking.staff.createDisruption({
        kind,
        membership_id: text(form, "membership_id") || null,
        service_id: text(form, "service_id") || null,
        starts_at: kigaliIso(text(form, "starts_at")),
        ends_at: kigaliIso(text(form, "ends_at")),
        reason: text(form, "reason"),
      }),
    onSuccess: onCreated,
  });
  const fields = isApiError(create.error) ? create.error.fields : {};
  const today = kigaliDate();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(new FormData(event.currentTarget));
  };
  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4" noValidate>
      <SelectField
        label={t("bookings.disruptions.kindLabel")}
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as DisruptionKind)}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`bookings.disruptions.kind.${k}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t("bookings.slot.doctor")}
        name="membership_id"
        optional={kind !== "doctor_absent"}
        error={fields.membership_id?.[0]}
        defaultValue=""
      >
        <option value="">{t("bookings.disruptions.anyDoctor")}</option>
        {(options.data?.doctors ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </SelectField>
      <SelectField label={t("bookings.slot.service")} name="service_id" optional defaultValue="">
        <option value="">{t("bookings.calendar.allServices")}</option>
        {(options.data?.services ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {name(s.name_i18n)}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("bookings.disruptions.from")}
          name="starts_at"
          type="datetime-local"
          required
          defaultValue={`${today}T08:00`}
          error={fields.starts_at?.[0]}
        />
        <TextField
          label={t("bookings.disruptions.to")}
          name="ends_at"
          type="datetime-local"
          required
          defaultValue={`${today}T17:00`}
          error={fields.ends_at?.[0]}
        />
      </div>
      <TextareaField
        label={t("bookings.disruptions.reason")}
        hint={t("bookings.disruptions.reasonHint")}
        name="reason"
        required
        maxLength={300}
        error={fields.reason?.[0]}
      />
      {create.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(create.error) ? create.error.message : t("bookings.disruptions.failed")}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("bookings.nav.back")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("bookings.disruptions.findAffected")}
        </Button>
      </div>
    </form>
  );
}

function ItemLabel({ item }: { item: DisruptionItem }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="font-semibold">{item.display_name}</span>
      <span className="text-body-sm text-fg-secondary tabular-nums">
        {item.target === "ticket"
          ? t("bookings.disruptions.remoteTicket", { number: item.ticket_number })
          : `${item.booking_code} · ${slotTime(item.starts_at, lang)}`}
        {item.doctor ? ` · ${item.doctor}` : ""}
      </span>
    </span>
  );
}

function AffectedStep({ data, onApplied }: { data: DisruptionDetail; onApplied: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Record<string, DisruptionAction | "">>({});
  const [all, setAll] = useState<DisruptionAction | "">("");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const open = data.items.filter((i) => i.action === null && i.resolved_at === null);
  const apply = useMutation({
    mutationFn: (body: Parameters<typeof api.booking.staff.applyDisruption>[1]) =>
      api.booking.staff.applyDisruption(data.disruption.id, body),
    onSuccess: (out) => {
      queryClient.setQueryData(disruptionKeys.one(out.disruption.id), out);
      void queryClient.invalidateQueries({ queryKey: disruptionKeys.list });
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      const left = out.problems ?? {};
      setProblems(left);
      if (Object.keys(left).length === 0) onApplied();
    },
  });
  const steps = Object.entries(chosen)
    .filter((entry): entry is [string, DisruptionAction] => Boolean(entry[1]))
    .map(([id, action]) => ({ id, action }));

  if (open.length === 0)
    return (
      <EmptyState
        size="inline"
        icon={CalendarX}
        title={t("bookings.disruptions.nothingTitle")}
        description={t("bookings.disruptions.nothing")}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{t("bookings.disruptions.affectedCount", { count: open.length })}</p>
      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface shadow-card p-4">
        <SelectField
          label={t("bookings.disruptions.forAll")}
          value={all}
          onChange={(e) => setAll(e.target.value as DisruptionAction | "")}
          className="w-64"
        >
          <option value="">{t("bookings.disruptions.choose")}</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`bookings.disruptions.action.${a}`)}
            </option>
          ))}
        </SelectField>
        <Button
          variant="secondary"
          disabled={!all}
          loading={apply.isPending && Boolean(all)}
          onClick={() => all && apply.mutate({ all })}
        >
          {t("bookings.disruptions.applyAll")}
        </Button>
      </div>
      <ul
        aria-label={t("bookings.disruptions.steps.affected")}
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {open.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface shadow-card p-3"
          >
            <ItemLabel item={item} />
            <SelectField
              label={t("bookings.disruptions.actionFor", { name: item.display_name })}
              value={chosen[item.id] ?? ""}
              onChange={(e) =>
                setChosen({ ...chosen, [item.id]: e.target.value as DisruptionAction })
              }
              error={
                problems[item.id]
                  ? t(`bookings.disruptions.problem.${problems[item.id]}`)
                  : undefined
              }
              className="w-64"
            >
              <option value="">{t("bookings.disruptions.choose")}</option>
              {ACTIONS.filter((a) => item.target === "booking" || a !== "next_slot").map((a) => (
                <option key={a} value={a}>
                  {t(`bookings.disruptions.action.${a}`)}
                </option>
              ))}
            </SelectField>
          </li>
        ))}
      </ul>
      {apply.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(apply.error) ? apply.error.message : t("bookings.disruptions.failed")}
        </Alert>
      )}
      {Object.keys(problems).length > 0 && (
        <Alert tone="warning" role="status">
          {t("bookings.disruptions.someLeft", { count: Object.keys(problems).length })}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          disabled={steps.length === 0}
          loading={apply.isPending && !all}
          onClick={() => apply.mutate({ items: steps })}
        >
          {t("bookings.disruptions.apply")}
        </Button>
      </div>
    </div>
  );
}

function AnswersStep({ data }: { data: DisruptionDetail }) {
  const { t } = useTranslation();
  const when = useWhen();
  const d = data.disruption;
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={d.status === "resolved" ? "success" : "info"} role="status">
        {d.status === "resolved"
          ? t("bookings.disruptions.resolved")
          : t("bookings.disruptions.waiting", { count: d.counts.pending })}
      </Alert>
      <ul
        aria-label={t("bookings.disruptions.steps.answers")}
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {data.items.map((item) => {
          const call = item.patient_response === "pending" && item.auto_accept === false;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface shadow-card p-3"
            >
              <ItemLabel item={item} />
              <span className="text-body-sm text-fg-secondary">
                {item.action
                  ? t(`bookings.disruptions.action.${item.action}`)
                  : t("bookings.disruptions.noAction")}
                {item.previous_starts_at
                  ? ` · ${t("bookings.disruptions.was", { when: when(item.previous_starts_at) })}`
                  : ""}
              </span>
              <Badge tone={RESPONSE_TONE[item.patient_response]}>
                {t(`bookings.disruptions.response.${item.patient_response}`)}
              </Badge>
              {call && (
                <span className="flex items-center gap-1 text-body-sm font-semibold text-warning">
                  <Phone aria-hidden="true" />
                  {item.contact_phone
                    ? t("bookings.disruptions.callAt", { phone: item.contact_phone })
                    : t("bookings.disruptions.call")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
