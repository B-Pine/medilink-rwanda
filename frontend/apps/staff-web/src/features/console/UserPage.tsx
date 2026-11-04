import {
  isApiError,
  type AccountAction,
  type AccountUpdate,
  type ConsoleEvent,
  type ConsoleMembership,
  type ConsoleUserDetail,
  type RoleCode,
} from "@medilink/api-client";
import { Alert, Button, Card, Dialog, LoadingState, SelectField, TextField } from "@medilink/ui";
import {
  ArrowCounterClockwise,
  EnvelopeSimple,
  Key,
  LockKey,
  LockKeyOpen,
  PencilSimple,
  ShieldSlash,
  SignOut,
  UserMinus,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { roleLabel } from "../../facility/labels";
import { useStepUp } from "../lock";
import { actionError, PlatformOnly } from "../platform/shared";
import {
  KindPill,
  OutcomeIcon,
  StatusDot,
  useActionLabel,
  useDateTime,
  useRelative,
} from "./shared";

/** Actions whose result is an email: the dialog says where it went. */
const EMAILS: AccountAction[] = ["send-password-reset", "resend-verification"];

/** One account action: what it does, shown on the page and asked for in the dialog. */
interface ActionSpec {
  key: AccountAction;
  icon: Icon;
  danger?: boolean;
}

/**
 * /platform/users/:id (#198): one person's account. What MediLink holds about it, what needs
 * attention (locked, blocked after failed sign-ins, email not confirmed, no two-step sign-in),
 * facility access with removal and restoring, pending invitations, what admins changed, and
 * sign-in activity. Every change needs a re-confirmed identity and a written reason, and is
 * audit-logged. Patients appear as accounts only, never with health data.
 */
export function UserPage() {
  return (
    <PlatformOnly>
      <UserDetail />
    </PlatformOnly>
  );
}

type Pending =
  | { kind: "action"; action: AccountAction }
  | { kind: "access"; membership: ConsoleMembership }
  | { kind: "edit" };

function UserDetail() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const api = useApi();
  const { data: me } = useStaffMe();
  const user = useQuery({ queryKey: ["console", "user", id], queryFn: () => api.console.user(id) });
  const [pending, setPending] = useState<Pending | null>(null);
  if (user.isPending) return <LoadingState />;
  if (user.isError)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title={t("console.users.title")}
          back={{ to: "/platform/users", label: t("console.users.back") }}
        />
        <Alert tone="danger">{t("console.failed")}</Alert>
      </div>
    );
  const u = user.data;
  const self = me?.id === u.id || me?.email === u.email;
  const canAct = !self;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={u.full_name}
        description={u.email}
        back={{ to: "/platform/users", label: t("console.users.back") }}
        badges={
          <>
            <KindPill kind={u.kind} />
            {u.is_active ? (
              <StatusDot tone="success">{t("console.users.active")}</StatusDot>
            ) : (
              <StatusDot tone="danger">{t("console.users.locked")}</StatusDot>
            )}
          </>
        }
        actions={
          canAct && (
            <Button
              variant="secondary"
              onClick={() => setPending({ kind: "edit" })}
              iconStart={<PencilSimple aria-hidden="true" className="size-4" />}
            >
              {t("console.users.edit")}
            </Button>
          )
        }
      />

      <Notices user={u} self={self} onAct={(action) => setPending({ kind: "action", action })} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <AccountCard user={u} />
          {u.kind === "patient" ? (
            <Card padding="md">
              <p className="m-0 text-body-sm text-fg-secondary">{t("console.users.patientNote")}</p>
            </Card>
          ) : (
            <AccessCard
              user={u}
              canAct={canAct}
              onChange={(membership) => setPending({ kind: "access", membership })}
            />
          )}
          <ChangesCard changes={u.changes} />
          <ActivityCard user={u} />
        </div>
        {canAct && (
          <ActionsCard user={u} onAct={(action) => setPending({ kind: "action", action })} />
        )}
      </div>

      {pending?.kind === "edit" && <EditDialog user={u} onClose={() => setPending(null)} />}
      {pending?.kind === "action" && (
        <ReasonDialog
          title={t(`console.users.actions.${pending.action}`)}
          description={t(`console.users.confirm.${pending.action}`, { name: u.full_name })}
          confirm={t(`console.users.actions.${pending.action}`)}
          danger={pending.action === "lock"}
          run={(reason) => api.console.act(u.id, pending.action, reason)}
          done={
            EMAILS.includes(pending.action)
              ? t(`console.users.done.${pending.action}`, { email: u.email })
              : undefined
          }
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "access" && (
        <ReasonDialog
          title={t(
            pending.membership.is_active
              ? "console.users.access.remove"
              : "console.users.access.restore",
          )}
          description={t(
            pending.membership.is_active
              ? "console.users.access.removeConfirm"
              : "console.users.access.restoreConfirm",
            { name: u.full_name, facility: pending.membership.facility_name },
          )}
          confirm={t(
            pending.membership.is_active
              ? "console.users.access.remove"
              : "console.users.access.restore",
          )}
          danger={pending.membership.is_active}
          run={(reason) =>
            api.console.facilityAccess(
              u.id,
              pending.membership.facility_id,
              pending.membership.is_active ? "remove" : "restore",
              reason,
            )
          }
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** What needs attention on this account, each with the action that solves it. */
function Notices({
  user,
  self,
  onAct,
}: {
  user: ConsoleUserDetail;
  self: boolean;
  onAct: (action: AccountAction) => void;
}) {
  const { t } = useTranslation();
  const notices: {
    key: string;
    tone: "info" | "warning" | "danger";
    text: string;
    action?: AccountAction;
  }[] = [];
  if (self) notices.push({ key: "self", tone: "info", text: t("console.users.notice.self") });
  if (!user.is_active)
    notices.push({
      key: "locked",
      tone: "danger",
      text: t("console.users.notice.locked"),
      action: "unlock",
    });
  if (user.sign_in_blocked_for > 0)
    notices.push({
      key: "blocked",
      tone: "warning",
      text: t("console.users.notice.blocked", {
        count: Math.ceil(user.sign_in_blocked_for / 60),
      }),
      action: "clear-sign-in-block",
    });
  if (user.verification_pending)
    notices.push({
      key: "pending",
      tone: "warning",
      text: t("console.users.notice.pending"),
      action: "resend-verification",
    });
  if (user.kind !== "patient" && !user.mfa_enabled && user.is_active)
    notices.push({ key: "mfa", tone: "warning", text: t("console.users.notice.mfa") });
  if (notices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {notices.map((n) => (
        <Alert key={n.key} tone={n.tone}>
          <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span>{n.text}</span>
            {n.action && !self && (
              <Button size="sm" variant="secondary" onClick={() => onAct(n.action!)}>
                {t(`console.users.actions.${n.action}`)}
              </Button>
            )}
          </span>
        </Alert>
      ))}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-body-sm text-fg-muted">{label}</dt>
          <dd className="m-0 min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="m-0 flex items-baseline gap-2 font-heading text-h4 font-bold">
      {children}
      {count !== undefined && (
        <span className="text-body-sm font-normal text-fg-muted tabular-nums">{count}</span>
      )}
    </h2>
  );
}

function AccountCard({ user }: { user: ConsoleUserDetail }) {
  const { t } = useTranslation();
  const dateTime = useDateTime();
  const relative = useRelative();
  const rows: [string, ReactNode][] = [
    [
      t("console.users.facts.email"),
      <a key="email" href={`mailto:${user.email}`}>
        {user.email}
      </a>,
    ],
    [
      t("console.users.facts.emailState"),
      user.verification_pending ? (
        <StatusDot tone="warning">{t("console.users.pending")}</StatusDot>
      ) : (
        t("console.users.confirmed")
      ),
    ],
  ];
  if (user.kind !== "patient") {
    rows.push([
      t("console.users.facts.phone"),
      user.phone ? (
        <a href={`tel:${user.phone}`} className="tabular-nums">
          {user.phone}
        </a>
      ) : (
        "—"
      ),
    ]);
    rows.push([
      t("console.users.facts.mfa"),
      user.mfa_enabled ? (
        <StatusDot tone="success">{t("console.users.mfaOn")}</StatusDot>
      ) : (
        <StatusDot tone="warning">{t("console.users.mfaOff")}</StatusDot>
      ),
    ]);
  }
  if (user.licence_state) {
    rows.push([
      t("console.users.facts.profession"),
      t(`setup.professions.${user.profession}`, { defaultValue: t("console.users.clinician") }),
    ]);
    rows.push([t("console.users.facts.licence"), t(`setup.licenceState.${user.licence_state}`)]);
  }
  rows.push(
    [t("console.users.facts.language"), t(`setup.languages.${user.preferred_language}`)],
    [
      t("console.users.facts.lastLogin"),
      user.last_login ? (
        <span title={dateTime(user.last_login)}>{relative(user.last_login)}</span>
      ) : (
        t("console.users.never")
      ),
    ],
    [t("console.users.facts.since"), dateTime(user.created_at)],
  );
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <SectionTitle>{t("console.users.account")}</SectionTitle>
      <Facts rows={rows} />
    </Card>
  );
}

function AccessCard({
  user,
  canAct,
  onChange,
}: {
  user: ConsoleUserDetail;
  canAct: boolean;
  onChange: (membership: ConsoleMembership) => void;
}) {
  const { t } = useTranslation();
  const dateTime = useDateTime();
  const relative = useRelative();
  const roles = (codes: string[]) => codes.map((r) => roleLabel(r as RoleCode, t)).join(" · ");
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionTitle count={user.facilities.length}>
          {t("console.users.access.title")}
        </SectionTitle>
        <p className="m-0 text-body-sm text-fg-secondary">{t("console.users.access.lead")}</p>
      </div>
      {user.facilities.length === 0 ? (
        <p className="m-0 text-body-sm text-fg-muted">{t("console.users.access.none")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {user.facilities.map((f) => (
            <li
              key={f.facility_id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <Link
                  to={`/platform/facilities/${f.facility_id}`}
                  className="font-semibold text-link no-underline hover:underline"
                >
                  {f.facility_name}
                </Link>
                <span className="text-body-sm text-fg-secondary">{roles(f.roles)}</span>
                {f.is_active ? (
                  <StatusDot tone="success">{t("console.users.access.active")}</StatusDot>
                ) : (
                  <span className="text-body-sm text-fg-muted">
                    <StatusDot tone="muted">
                      {f.deactivated_at
                        ? t("console.users.access.removedOn", { date: dateTime(f.deactivated_at) })
                        : t("console.users.access.removed")}
                    </StatusDot>
                    {f.deactivation_reason && <> · {f.deactivation_reason}</>}
                  </span>
                )}
              </span>
              {canAct && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange(f)}
                  iconStart={
                    f.is_active ? (
                      <UserMinus aria-hidden="true" className="size-4" />
                    ) : (
                      <ArrowCounterClockwise aria-hidden="true" className="size-4" />
                    )
                  }
                >
                  {t(f.is_active ? "console.users.access.remove" : "console.users.access.restore")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {user.invitations.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="m-0 text-body font-semibold">{t("console.users.invitations")}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body-sm">
            {user.invitations.map((i) => (
              <li key={i.facility_id} className="flex flex-col">
                <span>
                  <span className="font-semibold">{i.facility_name}</span> · {roles(i.roles)}
                </span>
                <span className="text-fg-muted">
                  {t("console.users.invited", {
                    sent: relative(i.invited_at),
                    expires: relative(i.expires_at),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function EventList({ events, empty }: { events: ConsoleEvent[]; empty: string }) {
  const relative = useRelative();
  const dateTime = useDateTime();
  const label = useActionLabel();
  if (events.length === 0) return <p className="m-0 text-body-sm text-fg-muted">{empty}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-1.5">
          <OutcomeIcon outcome={e.outcome} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-sm font-semibold">{label(e.action)}</span>
            <span className="text-caption text-fg-muted">
              {[e.object_type ? e.actor_name : "", e.facility_name, e.device, e.ip]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {e.reason && <span className="text-body-sm text-fg-secondary">“{e.reason}”</span>}
          </span>
          <time
            dateTime={e.occurred_at}
            title={dateTime(e.occurred_at)}
            className="shrink-0 text-caption text-fg-muted"
          >
            {relative(e.occurred_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function ChangesCard({ changes }: { changes: ConsoleEvent[] }) {
  const { t } = useTranslation();
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <SectionTitle>{t("console.users.changes")}</SectionTitle>
      <EventList events={changes} empty={t("console.users.noChanges")} />
    </Card>
  );
}

function ActivityCard({ user }: { user: ConsoleUserDetail }) {
  const { t } = useTranslation();
  const relative = useRelative();
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <SectionTitle>{t("console.users.activity")}</SectionTitle>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-body font-semibold">
          {t("console.users.sessions", { count: user.sessions.length })}
        </h3>
        {user.sessions.length === 0 ? (
          <p className="m-0 text-body-sm text-fg-muted">{t("console.users.noSessions")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 text-body-sm">
            {user.sessions.map((sess) => (
              <li
                key={sess.ref}
                className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {t(`console.audience.${sess.audience}`, { defaultValue: sess.audience })}
                  </span>
                  <span className="font-mono text-caption text-fg-muted">{sess.ref}</span>
                </span>
                <span className="text-right text-caption text-fg-muted">
                  {t("console.users.started", { time: relative(sess.created_at) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-body font-semibold">{t("console.users.events")}</h3>
        <EventList events={user.events} empty={t("console.empty")} />
      </div>
    </Card>
  );
}

/** The account actions that apply now, each with one line on what it does. */
function ActionsCard({
  user,
  onAct,
}: {
  user: ConsoleUserDetail;
  onAct: (action: AccountAction) => void;
}) {
  const { t } = useTranslation();
  const actions: ActionSpec[] = [
    // an account waiting for its sign-up confirmation needs that email, not a reset
    ...(user.is_active && !user.verification_pending
      ? [{ key: "send-password-reset" as const, icon: EnvelopeSimple }]
      : []),
    ...(user.verification_pending
      ? [{ key: "resend-verification" as const, icon: EnvelopeSimple }]
      : []),
    ...(user.sign_in_blocked_for > 0
      ? [{ key: "clear-sign-in-block" as const, icon: LockKeyOpen }]
      : []),
    { key: "revoke-sessions", icon: SignOut },
    ...(user.kind !== "patient" ? [{ key: "reset-mfa" as const, icon: Key }] : []),
    user.is_active
      ? { key: "lock", icon: LockKey, danger: true }
      : { key: "unlock", icon: LockKeyOpen },
  ];
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="account-actions"
      className="flex flex-col gap-3"
    >
      <h2 id="account-actions" className="m-0 font-heading text-h4 font-bold">
        {t("console.users.actionsTitle")}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {actions.map(({ key, icon: ActionIcon, danger }) => (
          <li
            key={key}
            className="border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <Button
              size="sm"
              variant={danger ? "danger" : "secondary"}
              onClick={() => onAct(key)}
              iconStart={<ActionIcon aria-hidden="true" className="size-4" />}
            >
              {t(`console.users.actions.${key}`)}
            </Button>
            <p className="m-0 mt-1.5 text-body-sm text-fg-secondary">
              {t(`console.users.hints.${key}`)}
            </p>
          </li>
        ))}
      </ul>
      <p className="m-0 flex items-start gap-2 border-t border-border pt-3 text-caption text-fg-muted">
        <ShieldSlash aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("console.users.actionsNote")}
      </p>
    </Card>
  );
}

/** Confirm an action with a written reason (audit log) after re-confirming identity. */
function ReasonDialog({
  title,
  description,
  confirm,
  danger,
  run,
  done,
  onClose,
}: {
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  run: (reason: string) => Promise<unknown>;
  /** Shown after success, for actions whose result is not visible on the page (an email). */
  done?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [reason, setReason] = useState("");
  const [finished, setFinished] = useState(false);
  const mutation = useMutation({
    mutationFn: () => withStepUp(() => run(reason.trim())),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["console"] });
      if (done) setFinished(true);
      else onClose();
    },
  });
  const failure = mutation.isError ? actionError(mutation.error, t("console.failed")) : undefined;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length >= 5) mutation.mutate();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={finished ? undefined : description}
      closeLabel={t("console.close")}
      footer={
        finished ? (
          <Button onClick={onClose}>{t("console.close")}</Button>
        ) : (
          <Button
            type="submit"
            form="reason-form"
            variant={danger ? "danger" : "primary"}
            loading={mutation.isPending}
            disabled={reason.trim().length < 5}
          >
            {confirm}
          </Button>
        )
      }
    >
      {finished ? (
        <Alert tone="success" role="status">
          {done}
        </Alert>
      ) : (
        <form id="reason-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
          {failure && (
            <Alert tone="danger" role="alert">
              {failure}
            </Alert>
          )}
          <TextField
            label={t("console.users.reason")}
            hint={t("console.users.reasonHint")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </form>
      )}
    </Dialog>
  );
}

/** Correct the name, work phone or language. The email and the password are never changed here:
 * the person resets their own password from the emailed link. */
function EditDialog({ user, onClose }: { user: ConsoleUserDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone,
    preferred_language: user.preferred_language,
    reason: "",
  });
  const body: AccountUpdate = { reason: form.reason.trim() };
  if (form.full_name.trim() !== user.full_name) body.full_name = form.full_name.trim();
  if (user.kind !== "patient" && form.phone.trim() !== user.phone) body.phone = form.phone.trim();
  if (form.preferred_language !== user.preferred_language)
    body.preferred_language = form.preferred_language;
  const changed = Object.keys(body).length > 1;
  const save = useMutation({
    mutationFn: () => withStepUp(() => api.console.updateUser(user.id, body)),
    onSuccess: async (next) => {
      queryClient.setQueryData(["console", "user", user.id], next);
      await queryClient.invalidateQueries({ queryKey: ["console", "users"] });
      onClose();
    },
  });
  const field = (name: string) =>
    isApiError(save.error) ? save.error.fieldError(name) : undefined;
  const failure =
    save.isError && !field("full_name") && !field("phone") && !field("reason")
      ? actionError(save.error, t("console.failed"))
      : undefined;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (changed && body.reason.length >= 5) save.mutate();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("console.users.edit")}
      description={t("console.users.editLead")}
      closeLabel={t("console.close")}
      footer={
        <Button
          type="submit"
          form="edit-account"
          loading={save.isPending}
          disabled={!changed || body.reason.length < 5}
        >
          {t("console.users.save")}
        </Button>
      }
    >
      <form id="edit-account" noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure && (
          <Alert tone="danger" role="alert">
            {failure}
          </Alert>
        )}
        <TextField
          label={t("console.users.fullName")}
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          error={field("full_name")}
          autoComplete="off"
        />
        {user.kind !== "patient" && (
          <TextField
            label={t("console.users.facts.phone")}
            hint={t("console.users.phoneHint")}
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            error={field("phone")}
            autoComplete="off"
          />
        )}
        <SelectField
          label={t("console.users.facts.language")}
          value={form.preferred_language}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              preferred_language: e.target.value as ConsoleUserDetail["preferred_language"],
            }))
          }
        >
          {(["rw", "en", "fr"] as const).map((lang) => (
            <option key={lang} value={lang}>
              {t(`setup.languages.${lang}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("console.users.reason")}
          hint={t("console.users.reasonHint")}
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          error={field("reason")}
        />
      </form>
    </Dialog>
  );
}
