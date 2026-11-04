import {
  newIdempotencyKey,
  type RoleCode,
  type Invitation,
  type ServicePoint,
  type StaffMembership,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  cx,
  Dialog,
  EmptyState,
  SidePanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
} from "@medilink/ui";
import {
  EnvelopeSimple,
  IdentificationBadge,
  MagnifyingGlass,
  ShieldCheck,
  UserPlus,
  Users,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { roleLabel } from "../../facility/labels";
import { ClinicianProfileForm } from "./ClinicianProfileForm";
import { MemberLicence, MemberWork } from "./MemberClinician";
import { PublicProfileCard } from "./PublicProfileCard";
import { useStepUp } from "../lock";
import {
  errorText,
  fieldErrors,
  formatDate,
  QueryState,
  SetupGate,
  setupKeys,
  useLocale,
} from "./shared";

const ROLES = [
  "facility_admin",
  "receptionist",
  "triage_nurse",
  "doctor",
  "lab_technician",
  "pharmacist",
  "cashier",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

/** /staff (S2-F7, FR-ACC-05/06): members, invitations, and member actions behind step-up. */
export function StaffPage() {
  const { t } = useTranslation();
  const api = useApi();
  const members = useQuery({ queryKey: setupKeys.members, queryFn: () => api.setup.memberships() });
  const invitations = useQuery({
    queryKey: setupKeys.invitations,
    queryFn: () => api.setup.invitations(),
  });
  const points = useQuery({ queryKey: setupKeys.points, queryFn: () => api.setup.points() });
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState<StaffMembership | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");

  const all = members.data?.results ?? [];
  const active = all.filter((m) => m.is_active);
  const doctors = active.filter((m) => m.roles.includes("doctor"));
  const pending = (invitations.data?.results ?? []).filter((i) => i.status === "pending");
  const attested = doctors.filter((d) => d.clinician?.attested_at).length;
  const withMfa = active.filter((m) => m.mfa_enabled).length;
  const stats = [
    {
      key: "active",
      icon: Users,
      label: t("setup.staff.activeMembers"),
      value: String(active.length),
      ratio: null,
    },
    {
      key: "attested",
      icon: IdentificationBadge,
      label: t("setup.staff.doctorsAttested"),
      value: `${attested}/${doctors.length}`,
      ratio: doctors.length ? attested / doctors.length : null,
    },
    {
      key: "mfa",
      icon: ShieldCheck,
      label: t("setup.staff.withMfa"),
      value: `${withMfa}/${active.length}`,
      ratio: active.length ? withMfa / active.length : null,
    },
    {
      key: "invites",
      icon: EnvelopeSimple,
      label: t("setup.staff.pendingInvites"),
      value: String(pending.length),
      ratio: null,
    },
  ];
  const shown = all.filter(
    (m) =>
      (!role || m.roles.includes(role)) &&
      (!query || `${m.full_name} ${m.email}`.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <SetupGate codes={["staff.manage"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.staff.title")}
          description={t("setup.staff.intro")}
          actions={
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden="true" weight="bold" />
              {t("setup.staff.invite")}
            </Button>
          }
        />
        <ul className="ml-stagger m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
          {stats.map(({ key, icon: StatIcon, label, value, ratio }) => (
            <li
              key={key}
              className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card transition-shadow duration-200 ease-out-quint hover:shadow-raised"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
                <span className="grid size-8 place-items-center rounded-lg bg-brand-subtle text-on-brand-subtle">
                  <StatIcon aria-hidden="true" weight="bold" className="size-4" />
                </span>
              </span>
              <span className="font-heading text-h1 leading-none font-semibold tabular-nums">
                {value}
              </span>
              {ratio !== null && (
                <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-subtle">
                  <span
                    className={cx(
                      "block h-full rounded-full transition-[width] duration-500 ease-out-quint",
                      ratio === 1 ? "bg-success" : "bg-attention",
                    )}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
        {active.length > withMfa && (
          <Alert
            tone="warning"
            title={t("setup.staff.mfaGapTitle", { count: active.length - withMfa })}
          >
            {t("setup.staff.mfaGapBody")}
          </Alert>
        )}
        <Tabs defaultValue="members">
          <TabsList aria-label={t("setup.staff.title")}>
            <TabsTrigger value="members">{t("setup.staff.members")}</TabsTrigger>
            <TabsTrigger value="invitations">
              {t("setup.staff.invitations")}
              {pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 text-caption text-warning tabular-nums">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <TextField
                  label={t("setup.staff.search")}
                  hideLabel
                  placeholder={t("setup.staff.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full max-w-xs"
                />
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={t("setup.staff.roles")}
                >
                  {["", ...ROLES].map((r) => (
                    <button
                      key={r || "all"}
                      type="button"
                      aria-pressed={role === r}
                      onClick={() => setRole(r)}
                      className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
                    >
                      {r ? roleLabel(r as RoleCode, t) : t("setup.staff.allRoles")}
                    </button>
                  ))}
                </div>
              </div>
              <QueryState query={members}>
                {() =>
                  shown.length === 0 ? (
                    <EmptyState
                      icon={query || role ? MagnifyingGlass : Users}
                      title={t("setup.staff.noneTitle")}
                      description={t("setup.staff.none")}
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
                      <table className="w-full border-collapse text-left">
                        <caption className="sr-only">{t("setup.staff.members")}</caption>
                        <thead className="bg-subtle text-body-sm text-fg-secondary">
                          <tr>
                            {["person", "roles", "mfa", "licence", "lastActive", "status"].map(
                              (col) => (
                                <th key={col} scope="col" className="px-4 py-2.5 font-semibold">
                                  {t(`setup.staff.columns.${col}`)}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((m) => (
                            <tr
                              key={m.id}
                              className={cx(
                                "border-t border-border/60 hover:bg-subtle",
                                !m.is_active && "text-fg-muted",
                              )}
                            >
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setOpen(m)}
                                  className="flex cursor-pointer items-center gap-3 text-left"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-caption font-bold text-on-brand-subtle"
                                  >
                                    {initials(m.full_name)}
                                  </span>
                                  <span className="flex flex-col">
                                    <span className="font-semibold text-link underline-offset-2 hover:underline">
                                      {m.full_name}
                                    </span>
                                    <span className="text-body-sm text-fg-secondary">
                                      {m.email}
                                    </span>
                                  </span>
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {m.roles.map((r) => (
                                    <Badge key={r} tone="neutral">
                                      {roleLabel(r as RoleCode, t)}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={m.mfa_enabled ? "success" : "warning"}>
                                  {m.mfa_enabled ? t("setup.staff.mfaOn") : t("setup.staff.mfaOff")}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                {m.clinician ? (
                                  <Badge tone={m.clinician.attested_at ? "success" : "warning"}>
                                    {m.clinician.attested_at
                                      ? t("setup.staff.attested")
                                      : t("setup.staff.notAttested")}
                                  </Badge>
                                ) : (
                                  <span className="text-fg-muted">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-body-sm whitespace-nowrap text-fg-secondary tabular-nums">
                                <LastActive at={m.last_login} />
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={m.is_active ? "brand" : "neutral"}>
                                  {m.is_active
                                    ? t("setup.staff.active")
                                    : t("setup.staff.deactivated")}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </QueryState>
            </div>
          </TabsContent>
          <TabsContent value="invitations">
            <div className="mt-4">
              <QueryState query={invitations}>
                {(data) => <InvitationList invitations={data.results} />}
              </QueryState>
            </div>
          </TabsContent>
        </Tabs>
        {inviting && (
          <InviteDialog points={points.data?.results ?? []} onClose={() => setInviting(false)} />
        )}
        {open && (
          <MemberPanel
            member={open}
            points={points.data?.results ?? []}
            onClose={() => setOpen(null)}
            onChanged={setOpen}
          />
        )}
      </div>
    </SetupGate>
  );
}

/** "12 min ago", "3 days ago", or "Never signed in" (relative, so the list reads at a glance). */
function LastActive({ at }: { at: string | null }) {
  const { t, i18n } = useTranslation();
  const [now] = useState(() => Date.now());
  if (!at) return <span className="text-attention">{t("setup.staff.neverSignedIn")}</span>;
  const minutes = Math.round((new Date(at).getTime() - now) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(
    i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage,
    { numeric: "auto" },
  );
  const text =
    Math.abs(minutes) < 60
      ? rtf.format(minutes, "minute")
      : Math.abs(minutes) < 1440
        ? rtf.format(Math.round(minutes / 60), "hour")
        : rtf.format(Math.round(minutes / 1440), "day");
  return (
    <time dateTime={at} title={new Date(at).toLocaleString()}>
      {text}
    </time>
  );
}

function InvitationList({ invitations }: { invitations: Invitation[] }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "resend" | "revoke" }) =>
      api.setup.invitationAction(id, action),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: setupKeys.invitations }),
  });
  const tone = {
    pending: "warning",
    accepted: "success",
    revoked: "neutral",
    expired: "neutral",
  } as const;
  if (invitations.length === 0)
    return (
      <EmptyState
        icon={EnvelopeSimple}
        title={t("setup.staff.noInvitesTitle")}
        description={t("setup.staff.noInvites")}
      />
    );
  return (
    <>
      <ul className="m-0 list-none overflow-hidden rounded-2xl bg-surface shadow-card p-0">
        {invitations.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0"
          >
            <EnvelopeSimple aria-hidden="true" className="size-5 text-fg-muted" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{i.full_name || i.email}</span>
              {i.full_name && (
                <span className="text-body-sm break-all text-fg-secondary">{i.email}</span>
              )}
              <span className="text-body-sm text-fg-secondary">
                {i.role_codes.map((r) => roleLabel(r as RoleCode, t)).join(", ")} ·{" "}
                {t("setup.staff.expires", { date: formatDate(i.expires_at, locale) })}
              </span>
            </div>
            <Badge tone={tone[i.status]}>{t(`setup.staff.inviteStatus.${i.status}`)}</Badge>
            {(i.status === "pending" || i.status === "expired") && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  onClick={() => act.mutate({ id: i.id, action: "resend" })}
                  aria-label={`${t("setup.staff.resend")}: ${i.email}`}
                >
                  {t("setup.staff.resend")}
                </Button>
                {i.status === "pending" && (
                  <Button
                    variant="ghost"
                    onClick={() => act.mutate({ id: i.id, action: "revoke" })}
                    aria-label={`${t("setup.staff.revoke")}: ${i.email}`}
                  >
                    {t("setup.staff.revoke")}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {act.isError && (
        <Alert tone="danger" role="alert" className="mt-3">
          {errorText(act.error, t("setup.failed"))}
        </Alert>
      )}
    </>
  );
}

function RoleChecks({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 font-semibold">{t("setup.staff.roles")}</legend>
      {ROLES.map((r) => (
        <CheckboxField
          key={r}
          label={roleLabel(r as RoleCode, t)}
          checked={value.includes(r)}
          onChange={(e) =>
            onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))
          }
        />
      ))}
      {error && <p className="m-0 text-body-sm font-semibold text-danger">{error}</p>}
    </fieldset>
  );
}

function PointChecks({
  points,
  value,
  onChange,
}: {
  points: ServicePoint[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  if (points.length === 0) return null;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 font-semibold">{t("setup.staff.points")}</legend>
      {points
        .filter((p) => p.is_active !== false)
        .map((p) => (
          <CheckboxField
            key={p.id}
            label={p.name}
            checked={value.includes(p.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))
            }
          />
        ))}
    </fieldset>
  );
}

function InviteDialog({ points, onClose }: { points: ServicePoint[]; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const key = useRef(newIdempotencyKey());
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    role_codes: [] as string[],
    service_point_ids: [] as string[],
  });
  const save = useMutation({
    mutationFn: () => withStepUp(() => api.setup.invite(form, key.current)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.invitations });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.staff.invite")}
      description={t("setup.staff.inviteHint")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button type="submit" form="invite-form" disabled={save.isPending}>
            {t("setup.staff.send")}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <TextField
          label={t("setup.staff.email")}
          type="email"
          autoComplete="off"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors.email}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("setup.staff.inviteName")}
            hint={t("setup.staff.optional")}
            autoComplete="off"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            error={errors.full_name}
          />
          <TextField
            label={t("setup.staff.invitePhone")}
            hint={t("setup.staff.optional")}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            error={errors.phone}
          />
        </div>
        <RoleChecks
          value={form.role_codes}
          onChange={(role_codes) => setForm((f) => ({ ...f, role_codes }))}
          error={errors.role_codes}
        />
        <PointChecks
          points={points}
          value={form.service_point_ids}
          onChange={(service_point_ids) => setForm((f) => ({ ...f, service_point_ids }))}
        />
        {save.isError &&
          Object.keys(errors).length === 0 &&
          errorText(save.error, t("setup.failed")) && (
            <Alert tone="danger" role="alert">
              {errorText(save.error, t("setup.failed"))}
            </Alert>
          )}
      </form>
    </Dialog>
  );
}

function MemberPanel({
  member,
  points,
  onClose,
  onChanged,
}: {
  member: StaffMembership;
  points: ServicePoint[];
  onClose: () => void;
  onChanged: (m: StaffMembership) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const { data: me } = useStaffMe();
  const [roles, setRoles] = useState(member.roles);
  const [assigned, setAssigned] = useState(member.service_points);
  const [deactivating, setDeactivating] = useState(false);
  const [notice, setNotice] = useState<string>();
  const done = (m: StaffMembership, message?: string) => {
    onChanged(m);
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: setupKeys.members });
    void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
  };
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.setup.updateMembership(member.id, {
          version: member.version,
          role_codes: roles,
          service_point_ids: assigned,
        }),
      ),
    onSuccess: (m) => done(m, t("setup.saved")),
  });
  const action = useMutation({
    mutationFn: ({
      name,
      reason,
    }: {
      name: "deactivate" | "reactivate" | "attest-licence" | "mfa-reset";
      reason?: string;
    }) => {
      const call = () => api.setup.membershipAction(member.id, name, reason);
      return name === "attest-licence" ? call() : withStepUp(call);
    },
    onSuccess: (m, vars) => {
      setDeactivating(false);
      done(m, t(`setup.staff.done.${vars.name}`));
    },
  });
  const errors = { ...fieldErrors(save.error), ...fieldErrors(action.error) };
  const lastAdmin = errors.role_codes === "last_admin";
  const isSelf = me?.email === member.email;
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={member.full_name}
      closeLabel={t("setup.close")}
      footer={
        <Button type="submit" form="member-form" disabled={save.isPending || !member.is_active}>
          {t("setup.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-12 items-center justify-center rounded-full bg-brand-subtle font-heading font-bold text-on-brand-subtle"
          >
            {initials(member.full_name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <a href={`mailto:${member.email}`} className="break-all text-fg-secondary">
              {member.email}
            </a>
            {member.phone ? (
              <a href={`tel:${member.phone}`} className="text-fg-secondary">
                {member.phone}
              </a>
            ) : (
              <span className="text-body-sm text-fg-muted">{t("setup.staff.noPhone")}</span>
            )}
            <span className="text-body-sm text-fg-muted">
              {t("setup.staff.joined", { date: formatDate(member.joined_at, locale) })}
            </span>
          </div>
        </div>
        {notice && (
          <Alert tone="success" role="status">
            {notice}
          </Alert>
        )}
        {lastAdmin && (
          <Alert tone="warning" role="alert">
            {t("setup.staff.lastAdmin")}
          </Alert>
        )}
        {(save.isError || action.isError) &&
          !lastAdmin &&
          errorText(save.error ?? action.error, t("setup.failed")) && (
            <Alert tone="danger" role="alert">
              {errorText(save.error ?? action.error, t("setup.failed"))}
            </Alert>
          )}
        {!member.is_active && (
          <Alert tone="info">
            {t("setup.staff.deactivatedBecause", { reason: member.deactivation_reason || "—" })}
          </Alert>
        )}
        <form
          id="member-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <RoleChecks value={roles} onChange={setRoles} />
          <PointChecks points={points} value={assigned} onChange={setAssigned} />
        </form>
        <MemberLicence member={member} onDone={done} />
        {member.is_active && <MemberWork member={member} onDone={done} />}
        <section className="flex flex-col gap-3 rounded-xl border border-danger/30 p-4">
          <h3 className="m-0 font-heading text-h3">{t("setup.staff.account")}</h3>
          <div className="flex flex-wrap gap-2">
            {!isSelf && member.mfa_enabled && (
              <Button variant="secondary" onClick={() => action.mutate({ name: "mfa-reset" })}>
                {t("setup.staff.mfaReset")}
              </Button>
            )}
            {member.is_active ? (
              !isSelf && (
                <Button variant="danger" onClick={() => setDeactivating(true)}>
                  {t("setup.staff.deactivate")}
                </Button>
              )
            ) : (
              <Button variant="secondary" onClick={() => action.mutate({ name: "reactivate" })}>
                {t("setup.staff.reactivate")}
              </Button>
            )}
          </div>
        </section>
      </div>
      {deactivating && (
        <DeactivateDialog
          name={member.full_name}
          busy={action.isPending}
          error={errors.reason}
          onClose={() => setDeactivating(false)}
          onConfirm={(reason) => action.mutate({ name: "deactivate", reason })}
        />
      )}
    </SidePanel>
  );
}

function DeactivateDialog({
  name,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  error?: string | undefined;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.staff.deactivateTitle", { name })}
      description={t("setup.staff.deactivateHint")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            {t("setup.staff.deactivate")}
          </Button>
        </>
      }
    >
      <TextareaField
        label={t("setup.staff.reason")}
        rows={3}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
      />
    </Dialog>
  );
}

// ---- own clinician profile -------------------------------------------------------------------

/** /profile/clinician: the signed-in staff member's council, licence and specialty. */
export function ClinicianPage() {
  const { t } = useTranslation();
  const api = useApi();
  const profile = useQuery({
    queryKey: ["setup", "clinician"],
    queryFn: () => api.setup.clinicianProfile(),
  });
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader title={t("setup.clinician.title")} description={t("setup.clinician.intro")} />
      <section aria-labelledby="licence-title" className="flex flex-col gap-3">
        <h2 id="licence-title" className="m-0 font-heading text-h3 tracking-tight">
          {t("setup.clinician.licenceTitle")}
        </h2>
        <QueryState query={profile}>{(data) => <ClinicianProfileForm profile={data} />}</QueryState>
      </section>
      {profile.data && <PublicProfileCard />}
    </div>
  );
}
