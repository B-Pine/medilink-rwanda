import type {
  ScheduleException,
  ScheduleOverview,
  ScheduleTemplate,
  Service,
  ServicePoint,
  SetupWarning,
  StaffMembership,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  Dialog,
  EmptyState,
  SelectField,
  SidePanel,
  TextareaField,
  TextField,
  TimeRangeField,
  timeBefore,
  WeekGrid,
  type WeekGridBlock,
} from "@medilink/ui";
import { AirplaneTilt, CalendarCheck, Check, Plus, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import {
  addDays,
  errorText,
  fieldErrors,
  formatDate,
  isoDate,
  mondayOf,
  QueryState,
  SetupGate,
  setupKeys,
  useCan,
  useDayNames,
  useLocale,
  useLocalName,
} from "./shared";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Leave inside this week as hatched "off" blocks, one per covered day. */
function leaveBlocks(
  exceptions: ScheduleException[],
  weekStart: Date,
  label: (e: ScheduleException) => string,
): WeekGridBlock[] {
  const blocks: WeekGridBlock[] = [];
  for (const e of exceptions) {
    if (e.kind === "extra_session" || e.status === "rejected" || e.status === "cancelled") continue;
    for (let i = 0; i < 7; i++) {
      const day = isoDate(addDays(weekStart, i));
      if (
        e.starts_at.slice(0, 10) <= day &&
        e.ends_at.slice(0, 10) >= day &&
        !(e.ends_at.slice(0, 10) === day && e.ends_at.slice(11, 16) === "00:00")
      )
        blocks.push({
          id: `${e.id}-${i}`,
          weekday: i,
          start: "07:00",
          end: "19:00",
          title: label(e),
          tone: e.status === "requested" ? "pending" : "off",
        });
    }
  }
  return blocks;
}

function useWeekStart() {
  return mondayOf(new Date());
}

/** /settings/schedules (S2-F3, F5): each doctor's week, drawn to scale, and leave decisions. */
export function SchedulesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const canManage = useCan("schedule.manage");
  const canStaff = useCan("staff.manage");
  const weekStart = useWeekStart();
  const from = isoDate(weekStart);
  const overview = useQuery({
    queryKey: setupKeys.overview(from),
    queryFn: () => api.setup.overview(from, isoDate(addDays(weekStart, 6))),
  });
  const members = useQuery({
    queryKey: setupKeys.members,
    queryFn: () => api.setup.memberships({ role: "doctor" }),
    enabled: canStaff,
  });
  const templates = useQuery({
    queryKey: ["setup", "templates"],
    queryFn: () => api.setup.templates(),
  });
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const points = useQuery({ queryKey: setupKeys.points, queryFn: () => api.setup.points() });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <SetupGate codes={["schedule.manage", "schedule.view"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.schedules.title")}
          description={t("setup.schedules.intro")}
          back={canManage ? { to: "/settings", label: t("setup.settings.title") } : undefined}
        />
        <QueryState query={overview}>
          {(data) =>
            data.members.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title={t("setup.schedules.noDoctorsTitle")}
                description={t("setup.schedules.noDoctors")}
                action={
                  canStaff && (
                    <Link to="/staff" className="font-semibold">
                      {t("setup.schedules.inviteDoctor")}
                    </Link>
                  )
                }
              />
            ) : (
              <DoctorWeeks
                overview={data}
                selected={selected ?? data.members[0]!.membership_id}
                onSelect={setSelected}
                weekStart={weekStart}
                templates={templates.data?.results ?? []}
                services={services.data?.results ?? []}
                points={points.data?.results ?? []}
                memberships={members.data?.results ?? []}
                canManage={canManage}
                canStaff={canStaff}
              />
            )
          }
        </QueryState>
        <ExceptionsSection canManage={canManage} />
      </div>
    </SetupGate>
  );
}

function DoctorWeeks({
  overview,
  selected,
  onSelect,
  weekStart,
  templates,
  services,
  points,
  memberships,
  canManage,
  canStaff,
}: {
  overview: ScheduleOverview;
  selected: string;
  onSelect: (id: string) => void;
  weekStart: Date;
  templates: ScheduleTemplate[];
  services: Service[];
  points: ServicePoint[];
  memberships: StaffMembership[];
  canManage: boolean;
  canStaff: boolean;
}) {
  const { t } = useTranslation();
  const name = useLocalName();
  const { long } = useDayNames();
  const [editing, setEditing] = useState<{
    template: ScheduleTemplate | null;
    weekday: number;
  } | null>(null);
  const [warnings, setWarnings] = useState<SetupWarning[]>([]);
  const member = overview.members.find((m) => m.membership_id === selected) ?? overview.members[0]!;
  const membership = memberships.find((m) => m.id === member.membership_id);
  const unattested = membership && !membership.clinician?.attested_at;
  const own = templates.filter((tpl) => tpl.membership_id === member.membership_id);
  const serviceName = (id: string) => name(services.find((s) => s.id === id)?.name_i18n);
  const pointName = (id: string | null | undefined) => points.find((p) => p.id === id)?.name;
  const blocks: WeekGridBlock[] = [
    ...own.map((tpl) => ({
      id: tpl.id,
      weekday: tpl.weekday,
      start: tpl.starts_at.slice(0, 5),
      end: tpl.ends_at.slice(0, 5),
      title: serviceName(tpl.service_id),
      subtitle: pointName(tpl.service_point_id),
    })),
    ...leaveBlocks(member.exceptions, weekStart, (e) => t(`setup.schedules.kinds.${e.kind}`)),
  ];
  const hours = own.reduce((sum, tpl) => {
    const [sh = 0, sm = 0] = tpl.starts_at.split(":").map(Number);
    const [eh = 0, em = 0] = tpl.ends_at.split(":").map(Number);
    return sum + (eh * 60 + em - sh * 60 - sm) / 60;
  }, 0);
  const today = (new Date().getUTCDay() + 6) % 7;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t("setup.schedules.doctors")}
        className="flex flex-wrap gap-2"
      >
        {overview.members.map((m) => {
          const active = m.membership_id === member.membership_id;
          return (
            <button
              key={m.membership_id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(m.membership_id)}
              className={cx(
                "inline-flex min-h-target cursor-pointer items-center gap-2.5 rounded-full border py-1 pr-4 pl-1 font-semibold",
                active
                  ? "border-primary bg-brand-subtle text-on-brand-subtle"
                  : "border-border bg-surface text-fg-secondary hover:text-fg",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex size-8 items-center justify-center rounded-full text-caption font-bold",
                  active ? "bg-primary text-on-primary" : "bg-subtle text-fg-secondary",
                )}
              >
                {initials(m.full_name)}
              </span>
              {m.full_name}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t("setup.schedules.weeklyHours"), hours.toFixed(1)],
          [t("setup.schedules.sessions"), String(own.length)],
          [
            t("setup.schedules.leaveThisWeek"),
            String(
              new Set(
                blocks
                  .filter((b) => b.tone === "off" || b.tone === "pending")
                  .map((b) => b.weekday),
              ).size,
            ),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
            <span className="font-heading text-h1 tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {unattested && (
        <Alert tone="warning" title={t("setup.schedules.unattestedTitle")}>
          <p className="m-0">{t("setup.schedules.unattested")}</p>
          {canStaff && (
            <Link to="/staff" className="mt-1 inline-block font-semibold">
              {t("setup.schedules.goToStaff")}
            </Link>
          )}
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert tone="warning" role="status" title={t("setup.schedules.busyElsewhereTitle")}>
          <ul className="m-0 pl-5">
            {warnings.map((w, i) => (
              <li key={i} className="tabular-nums">
                {t("setup.schedules.busyElsewhere", {
                  day: long[w.weekday ?? 0],
                  start: w.starts_at,
                  end: w.ends_at,
                })}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <WeekGrid
        blocks={blocks}
        dayLabels={long}
        today={today}
        labels={{
          caption: t("setup.schedules.weekOf", { name: member.full_name }),
          gridView: t("setup.schedules.gridView"),
          tableView: t("setup.schedules.tableView"),
          day: t("setup.schedules.day"),
          time: t("setup.schedules.time"),
          session: t("setup.schedules.session"),
          actions: t("setup.schedules.actions"),
          add: (day) => t("setup.schedules.addOn", { day }),
          edit: t("setup.edit"),
          empty: t("setup.schedules.noSession"),
        }}
        onSelect={
          canManage
            ? (b) => {
                const template = own.find((tpl) => tpl.id === b.id);
                if (template) setEditing({ template, weekday: template.weekday });
              }
            : undefined
        }
        onAdd={
          canManage && !unattested
            ? (weekday) => setEditing({ template: null, weekday })
            : undefined
        }
      />
      {editing && (
        <TemplateEditor
          membershipId={member.membership_id}
          doctorName={member.full_name}
          template={editing.template}
          weekday={editing.weekday}
          services={services}
          points={points}
          onClose={() => setEditing(null)}
          onWarnings={setWarnings}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  membershipId,
  doctorName,
  template,
  weekday,
  services,
  points,
  onClose,
  onWarnings,
}: {
  membershipId: string;
  doctorName: string;
  template: ScheduleTemplate | null;
  weekday: number;
  services: Service[];
  points: ServicePoint[];
  onClose: () => void;
  onWarnings: (w: SetupWarning[]) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const { long } = useDayNames();
  const queryClient = useQueryClient();
  const bookable = services.filter((s) => s.is_active);
  const [form, setForm] = useState({
    weekday: template?.weekday ?? weekday,
    starts_at: template?.starts_at.slice(0, 5) ?? "08:00",
    ends_at: template?.ends_at.slice(0, 5) ?? "12:00",
    service_id: template?.service_id ?? bookable[0]?.id ?? "",
    service_point_id: template?.service_point_id ?? "",
    slot_minutes: template?.slot_minutes ?? 15,
    capacity: template?.capacity ?? 1,
    bookable_share_pct: template?.bookable_share_pct ?? 100,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["setup", "templates"] });
    void queryClient.invalidateQueries({ queryKey: ["setup", "overview"] });
    void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
  };
  const body = { ...form, service_point_id: form.service_point_id || null };
  const save = useMutation({
    mutationFn: () =>
      template
        ? api.setup.updateTemplate(template.id, { ...body, version: template.version })
        : api.setup.addTemplate({ ...body, membership_id: membershipId }),
    onSuccess: (result) => {
      onWarnings(result.warnings);
      refresh();
      onClose();
    },
  });
  const end = useMutation({
    mutationFn: () => api.setup.endTemplate(template!.id),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const valid = timeBefore(form.starts_at, form.ends_at);
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        template
          ? t("setup.schedules.editSession")
          : t("setup.schedules.newSession", { name: doctorName })
      }
      closeLabel={t("setup.close")}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          {template ? (
            <Button variant="danger" onClick={() => end.mutate()} disabled={end.isPending}>
              {t("setup.schedules.endSession")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="template-form" disabled={!valid || save.isPending}>
            {t("setup.save")}
          </Button>
        </div>
      }
    >
      <form
        id="template-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <SelectField
          label={t("setup.schedules.day")}
          value={String(form.weekday)}
          onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}
        >
          {long.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </SelectField>
        <TimeRangeField
          label={t("setup.schedules.time")}
          start={form.starts_at}
          end={form.ends_at}
          onChange={({ start, end: finish }) =>
            setForm((f) => ({ ...f, starts_at: start, ends_at: finish }))
          }
          labels={{
            start: t("setup.schedules.starts"),
            end: t("setup.schedules.ends"),
            order: t("setup.hours.order"),
          }}
          error={errors.starts_at === "overlap" ? t("setup.schedules.overlap") : errors.ends_at}
        />
        <SelectField
          label={t("setup.schedules.service")}
          value={form.service_id}
          onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}
          error={errors.service_id}
        >
          {bookable.map((s) => (
            <option key={s.id} value={s.id}>
              {name(s.name_i18n)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("setup.schedules.point")}
          optional
          value={form.service_point_id}
          onChange={(e) => setForm((f) => ({ ...f, service_point_id: e.target.value }))}
        >
          <option value="">—</option>
          {points
            .filter((p) => p.is_active !== false)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </SelectField>
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label={t("setup.schedules.slot")}
            type="number"
            min={5}
            max={240}
            value={String(form.slot_minutes)}
            onChange={(e) => setForm((f) => ({ ...f, slot_minutes: Number(e.target.value) }))}
            error={errors.slot_minutes}
            inputClassName="tabular-nums"
          />
          <TextField
            label={t("setup.schedules.capacity")}
            type="number"
            min={1}
            max={50}
            value={String(form.capacity)}
            onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
            inputClassName="tabular-nums"
          />
          <TextField
            label={t("setup.schedules.share")}
            hint={t("setup.schedules.shareHint")}
            type="number"
            min={0}
            max={100}
            value={String(form.bookable_share_pct)}
            onChange={(e) => setForm((f) => ({ ...f, bookable_share_pct: Number(e.target.value) }))}
            inputClassName="tabular-nums"
          />
        </div>
        {errors.membership_id === "licence_not_attested" && (
          <Alert tone="warning" role="alert">
            {t("setup.schedules.unattested")}
          </Alert>
        )}
        {save.isError && !errors.membership_id && !errors.starts_at && !errors.ends_at && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
      </form>
    </SidePanel>
  );
}

const STATUS_TONE = {
  requested: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
} as const;

function ExceptionsSection({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const exceptions = useQuery({
    queryKey: setupKeys.exceptions,
    queryFn: () => api.setup.exceptions(),
  });
  const [rejecting, setRejecting] = useState<ScheduleException | null>(null);
  const decide = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: "approve" | "reject";
      note?: string;
    }) => api.setup.decideException(id, action, note),
    onSuccess: () => {
      setRejecting(null);
      void queryClient.invalidateQueries({ queryKey: setupKeys.exceptions });
      void queryClient.invalidateQueries({ queryKey: ["setup", "overview"] });
    },
  });
  return (
    <section aria-labelledby="exceptions" className="flex flex-col gap-3">
      <h2 id="exceptions" className="m-0 font-heading text-h2">
        {t("setup.schedules.exceptions")}
      </h2>
      <QueryState query={exceptions}>
        {(data) =>
          data.results.length === 0 ? (
            <EmptyState
              size="inline"
              icon={AirplaneTilt}
              title={t("setup.schedules.noExceptionsTitle")}
              description={t("setup.schedules.noExceptions")}
              className="rounded-lg border border-dashed border-border"
            />
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
              {data.results.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">
                      {e.member_name} · {t(`setup.schedules.kinds.${e.kind}`)}
                    </span>
                    <span className="text-body-sm text-fg-secondary tabular-nums">
                      {formatDate(e.starts_at, locale)} – {formatDate(e.ends_at, locale)}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </span>
                  </div>
                  <Badge tone={STATUS_TONE[e.status]}>
                    {t(`setup.schedules.status.${e.status}`)}
                  </Badge>
                  {canManage && e.status === "requested" && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => decide.mutate({ id: e.id, action: "approve" })}
                        aria-label={`${t("setup.schedules.approve")}: ${e.member_name}`}
                      >
                        <Check aria-hidden="true" weight="bold" />
                        {t("setup.schedules.approve")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setRejecting(e)}
                        aria-label={`${t("setup.schedules.reject")}: ${e.member_name}`}
                      >
                        <X aria-hidden="true" weight="bold" />
                        {t("setup.schedules.reject")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {decide.isError && !rejecting && (
        <Alert tone="danger" role="alert">
          {errorText(decide.error, t("setup.failed"))}
        </Alert>
      )}
      {rejecting && (
        <RejectDialog
          onClose={() => setRejecting(null)}
          onReject={(note) => decide.mutate({ id: rejecting.id, action: "reject", note })}
          error={fieldErrors(decide.error).decision_note}
          busy={decide.isPending}
        />
      )}
    </section>
  );
}

function RejectDialog({
  onClose,
  onReject,
  error,
  busy,
}: {
  onClose: () => void;
  onReject: (note: string) => void;
  error?: string | undefined;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.schedules.rejectTitle")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button variant="danger" disabled={busy || !note.trim()} onClick={() => onReject(note)}>
            {t("setup.schedules.reject")}
          </Button>
        </>
      }
    >
      <TextareaField
        label={t("setup.schedules.rejectReason")}
        rows={3}
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error}
      />
    </Dialog>
  );
}

// ---- doctor: my schedule ---------------------------------------------------------------------

/** /schedule/mine (S2-F10): a doctor's own week and leave requests. */
export function MySchedulePage() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const name = useLocalName();
  const { long } = useDayNames();
  const queryClient = useQueryClient();
  const weekStart = useWeekStart();
  const from = isoDate(weekStart);
  const overview = useQuery({
    queryKey: setupKeys.overview(from),
    queryFn: () => api.setup.overview(from, isoDate(addDays(weekStart, 6))),
  });
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const exceptions = useQuery({
    queryKey: setupKeys.exceptions,
    queryFn: () => api.setup.exceptions(),
  });
  const [requesting, setRequesting] = useState(false);
  const cancel = useMutation({
    mutationFn: (id: string) => api.setup.decideException(id, "cancel"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.exceptions });
      void queryClient.invalidateQueries({ queryKey: ["setup", "overview"] });
    },
  });
  const me = overview.data?.members[0];
  return (
    <SetupGate codes={["leave.request"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.mine.title")}
          description={t("setup.mine.intro")}
          actions={
            me && (
              <Button onClick={() => setRequesting(true)}>
                <Plus aria-hidden="true" weight="bold" />
                {t("setup.mine.requestLeave")}
              </Button>
            )
          }
        />
        <QueryState query={overview}>
          {(data) => {
            const member = data.members[0];
            if (!member)
              return (
                <EmptyState
                  icon={CalendarCheck}
                  title={t("setup.mine.noScheduleTitle")}
                  description={t("setup.mine.noSchedule")}
                />
              );
            const blocks: WeekGridBlock[] = [
              ...member.blocks.map((b) => {
                const date = new Date(b.starts_at);
                return {
                  id: `${b.template_id}-${b.starts_at}`,
                  weekday: (new Date(`${b.starts_at.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7,
                  start: b.starts_at.slice(11, 16),
                  end: b.ends_at.slice(11, 16),
                  title: name(services.data?.results.find((s) => s.id === b.service_id)?.name_i18n),
                  subtitle: formatDate(date.toISOString(), locale),
                };
              }),
              ...leaveBlocks(member.exceptions, weekStart, (e) =>
                t(`setup.schedules.kinds.${e.kind}`),
              ),
            ];
            return (
              <WeekGrid
                blocks={blocks}
                dayLabels={long}
                today={(new Date().getUTCDay() + 6) % 7}
                labels={{
                  caption: t("setup.mine.week"),
                  gridView: t("setup.schedules.gridView"),
                  tableView: t("setup.schedules.tableView"),
                  day: t("setup.schedules.day"),
                  time: t("setup.schedules.time"),
                  session: t("setup.schedules.session"),
                  actions: t("setup.schedules.actions"),
                  add: (day) => t("setup.schedules.addOn", { day }),
                  edit: t("setup.edit"),
                  empty: t("setup.schedules.noSession"),
                }}
              />
            );
          }}
        </QueryState>
        <section aria-labelledby="my-leave" className="flex flex-col gap-3">
          <h2 id="my-leave" className="m-0 font-heading text-h2">
            {t("setup.mine.leave")}
          </h2>
          <QueryState query={exceptions}>
            {(data) =>
              data.results.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={AirplaneTilt}
                  title={t("setup.mine.noLeaveTitle")}
                  description={t("setup.mine.noLeave")}
                  className="rounded-lg border border-dashed border-border"
                />
              ) : (
                <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
                  {data.results.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                    >
                      <span className="flex-1 tabular-nums">
                        {formatDate(e.starts_at, locale)} – {formatDate(e.ends_at, locale)}
                        {e.reason && <span className="text-fg-secondary"> · {e.reason}</span>}
                      </span>
                      <Badge tone={STATUS_TONE[e.status]}>
                        {t(`setup.schedules.status.${e.status}`)}
                      </Badge>
                      {e.decision_note && (
                        <span className="text-body-sm text-fg-secondary">{e.decision_note}</span>
                      )}
                      {e.status === "requested" && (
                        <Button variant="ghost" onClick={() => cancel.mutate(e.id)}>
                          {t("setup.mine.cancel")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </section>
        {requesting && me && (
          <LeaveDialog membershipId={me.membership_id} onClose={() => setRequesting(false)} />
        )}
      </div>
    </SetupGate>
  );
}

function LeaveDialog({ membershipId, onClose }: { membershipId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const tomorrow = isoDate(addDays(new Date(), 1));
  const [form, setForm] = useState({ from: tomorrow, to: tomorrow, reason: "" });
  const save = useMutation({
    mutationFn: () =>
      api.setup.addException({
        membership_id: membershipId,
        kind: "leave",
        starts_at: `${form.from}T00:00:00+02:00`,
        ends_at: `${isoDate(addDays(new Date(`${form.to}T00:00:00Z`), 1))}T00:00:00+02:00`,
        reason: form.reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.exceptions });
      void queryClient.invalidateQueries({ queryKey: ["setup", "overview"] });
      onClose();
    },
  });
  const order = form.to < form.from ? t("setup.hours.dateOrder") : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.mine.requestLeave")}
      description={t("setup.mine.requestHint")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button type="submit" form="leave-form" disabled={save.isPending || Boolean(order)}>
            {t("setup.mine.send")}
          </Button>
        </>
      }
    >
      <form
        id="leave-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap gap-4">
          <TextField
            type="date"
            label={t("setup.hours.from")}
            value={form.from}
            min={tomorrow}
            onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
            className="w-48"
          />
          <TextField
            type="date"
            label={t("setup.mine.lastDay")}
            value={form.to}
            min={form.from}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            error={order}
            className="w-48"
          />
        </div>
        <TextField
          label={t("setup.hours.reason")}
          value={form.reason}
          maxLength={200}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          optional
        />
        {save.isError && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
