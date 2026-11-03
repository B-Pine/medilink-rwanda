import { newIdempotencyKey, type Invite, type Sex } from "@medilink/api-client";
import {
  ArrowRight,
  HandHeart,
  HourglassMedium,
  ShareNetwork,
  UserPlus,
  type Icon,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  ConfirmDialog,
  cx,
  Dialog,
  LoadingState,
  PasswordField,
  SelectField,
  TextField,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { Avatar, PageHeader, panelClass, RowIcon, WidgetCard } from "../dashboard/kit";
import { can, useProfiles, useRelationshipLabel } from "./ProfileLayout";
import { CONSENT_VERSION, errorText, fieldErrors, formatDateTime, useLocale } from "./shared";

/** Whole years since a date of birth (YYYY-MM-DD), or null. */
function ageYears(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T12:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - born.getUTCFullYear();
  if (
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())
  )
    years -= 1;
  return years;
}

/** /family: dependents, invites given and received, accept a code, revoke (FR-PAT-03). */
export function FamilyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const label = useRelationshipLabel();
  const profiles = useProfiles();
  const delegations = useQuery({
    queryKey: ["profile", "delegations"],
    queryFn: () => api.profile.delegations(),
  });
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  };
  const revoke = useMutation({
    mutationFn: (id: string) => api.profile.revoke(id),
    onSuccess: () => {
      setRevoking(null);
      refresh();
    },
  });
  const d = delegations.data;
  const people = profiles.data?.results ?? [];
  // one row per grant, invite and received access, each with its one action
  const accessRows: {
    id: string;
    icon: Icon;
    text: string;
    badge?: string;
    action?: string;
    name: string;
  }[] = d
    ? [
        ...d.granted.map((row) => ({
          id: row.id,
          icon: ShareNetwork,
          text: t("profile.family.grantedRow", {
            holder: row.holder_name,
            profile: row.profile_name,
          }),
          badge: label(row.relationship),
          action: row.can_revoke ? t("profile.family.revoke") : undefined,
          name: row.holder_name ?? "",
        })),
        ...d.received.map((row) => ({
          id: row.id,
          icon: HandHeart,
          text: t("profile.family.receivedRow", { profile: row.profile_name }),
          action: t("profile.family.leave"),
          name: row.profile_name,
        })),
        ...d.pending_invites.map((invite) => ({
          id: invite.id,
          icon: HourglassMedium,
          text: t("profile.family.pendingRow", {
            profile: invite.profile_name,
            date: formatDateTime(invite.expires_at, locale, false),
          }),
          action: t("profile.family.cancelInvite"),
          name: invite.profile_name,
        })),
      ]
    : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.family.title")}
        subtitle={t("dashboard.family.subtitle")}
        actions={<AddDependent onDone={refresh} />}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="profiles" className="flex flex-col gap-3">
            <h2 id="profiles" className="m-0 font-heading text-h3 font-bold">
              {t("profile.family.profiles")}
            </h2>
            {profiles.isPending ? (
              <LoadingState />
            ) : (
              <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
                {people.map((p) => {
                  const age = ageYears(p.date_of_birth);
                  const self = p.relationship === "self";
                  return (
                    <li key={p.patient_id}>
                      <Link
                        to={self ? paths.profileOf(p.patient_id) : paths.member(p.patient_id)}
                        className={cx(
                          panelClass,
                          "group flex h-full flex-col gap-4 p-5 text-fg no-underline",
                          "transition-[border-color,box-shadow] duration-200 ease-out-quint hover:border-brand/40 hover:shadow-card",
                        )}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <Avatar name={p.display_name} size="lg" />
                          <Badge tone={self ? "brand" : "neutral"}>
                            {self
                              ? t("dashboard.family.you")
                              : t(`dashboard.family.access.${p.relationship}`)}
                          </Badge>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="font-heading text-h3 font-bold">{p.display_name}</span>
                          <span className="text-body-sm text-fg-secondary">
                            {[
                              label(p.relationship),
                              age !== null ? t("dashboard.family.age", { count: age }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-body-sm">
                          <span className="font-mono text-fg-muted tracking-wide">
                            {p.medilink_number}
                          </span>
                          <span className="inline-flex items-center gap-1 font-semibold text-link">
                            {t("dashboard.family.open")}
                            <ArrowRight
                              aria-hidden="true"
                              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                            />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <WidgetCard id="access" title={t("profile.family.access")}>
            {delegations.isPending ? (
              <LoadingState />
            ) : accessRows.length === 0 ? (
              <p className="m-0 p-5 text-fg-muted">{t("profile.family.noAccess")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {accessRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5"
                  >
                    <RowIcon icon={row.icon} tone="neutral" />
                    <span className="min-w-0 flex-1 text-body-sm text-fg">{row.text}</span>
                    {row.badge && <Badge tone="neutral">{row.badge}</Badge>}
                    {row.action && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevoking({ id: row.id, name: row.name })}
                      >
                        {row.action}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </WidgetCard>
        </div>

        <aside className="flex flex-col gap-6">
          <Invite />
          <AcceptCode onDone={refresh} />
        </aside>
      </div>
      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRevoking(null)}
          title={t("profile.family.revokeTitle")}
          consequences={t("profile.family.revokeConsequences", { name: revoking.name })}
          confirmLabel={t("profile.family.revoke")}
          cancelLabel={t("profile.cancel")}
          closeLabel={t("profile.close")}
          tone="danger"
          busy={revoke.isPending}
          error={revoke.isError ? errorText(revoke.error, t("profile.error")) : undefined}
          onConfirm={() => revoke.mutate(revoking.id)}
        />
      )}
    </div>
  );
}

function AddDependent({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const key = useRef(newIdempotencyKey());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    relationship: "guardian",
    full_name: "",
    sex: "",
    date_of_birth: "",
    attested: false,
  });
  const add = useMutation({
    mutationFn: () =>
      api.profile.addDependent(
        {
          relationship: form.relationship as "guardian" | "delegate",
          full_name: form.full_name,
          sex: form.sex as Sex,
          date_of_birth: form.date_of_birth || null,
          consent_version: CONSENT_VERSION,
          consent_attested: form.attested,
        },
        key.current,
      ),
    onSuccess: () => {
      key.current = newIdempotencyKey();
      setOpen(false);
      setForm({
        relationship: "guardian",
        full_name: "",
        sex: "",
        date_of_birth: "",
        attested: false,
      });
      onDone();
    },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)} className="shadow-card">
        <UserPlus aria-hidden="true" weight="bold" className="size-4" />
        {t("profile.family.add")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("profile.family.add")}
        closeLabel={t("profile.close")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("profile.cancel")}
            </Button>
            <Button
              type="submit"
              form="add-dependent"
              disabled={!form.full_name || !form.sex || add.isPending}
            >
              {t("profile.save")}
            </Button>
          </>
        }
      >
        <form
          id="add-dependent"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <SelectField
            label={t("profile.family.who")}
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          >
            <option value="guardian">{t("profile.family.child")}</option>
            <option value="delegate">{t("profile.family.adult")}</option>
          </SelectField>
          <TextField
            label={t("profile.fields.fullName")}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <SelectField
            label={t("profile.fields.sex")}
            value={form.sex}
            onChange={(e) => setForm({ ...form, sex: e.target.value })}
          >
            <option value="">—</option>
            <option value="female">{t("profile.sex.female")}</option>
            <option value="male">{t("profile.sex.male")}</option>
            <option value="other">{t("profile.sex.other")}</option>
          </SelectField>
          <TextField
            type="date"
            label={t("profile.fields.dateOfBirth")}
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            error={fieldErrors(add.error).date_of_birth}
          />
          {form.relationship === "delegate" && (
            <CheckboxField
              label={t("profile.family.attest")}
              checked={form.attested}
              onChange={(e) => setForm({ ...form, attested: e.target.checked })}
            />
          )}
          {add.isError && (
            <Alert tone="danger" role="alert">
              {errorText(add.error, t("profile.error"))}
            </Alert>
          )}
        </form>
      </Dialog>
    </>
  );
}

function Invite() {
  const { t } = useTranslation();
  const api = useApi();
  const profiles = useProfiles();
  const label = useRelationshipLabel();
  const shareable = (profiles.data?.results ?? []).filter((p) => can.invite(p.relationship));
  const [patientId, setPatientId] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api.profile.createInvite({
        patient_id: patientId || shareable[0]!.patient_id,
        current_password: password,
        consent_version: CONSENT_VERSION,
      }),
    onSuccess: (data) => {
      setPassword("");
      setInvite(data);
    },
  });
  if (shareable.length === 0) return null;
  return (
    <WidgetCard id="invite" title={t("profile.family.inviteTitle")}>
      <div className="flex flex-col gap-3 p-5">
        {invite ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-body-sm text-fg-secondary">{t("profile.family.codeOnce")}</p>
            <p
              className="ml-ticket-stub m-0 rounded-xl border border-brand/30 bg-brand-subtle px-4 py-4 text-center font-mono text-h1 tracking-widest text-fg"
              aria-label={t("profile.family.code")}
            >
              {invite.code}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(invite.code).then(() => setCopied(true));
                }}
              >
                {copied ? t("profile.family.copied") : t("profile.family.copy")}
              </Button>
              <Button variant="ghost" onClick={() => setInvite(null)}>
                {t("profile.family.done")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <p className="m-0 text-fg-secondary">{t("profile.family.inviteHint")}</p>
            <SelectField
              label={t("profile.family.profileToShare")}
              value={patientId || shareable[0]!.patient_id}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {shareable.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.display_name} ({label(p.relationship)})
                </option>
              ))}
            </SelectField>
            <PasswordField
              label={t("profile.family.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={fieldErrors(create.error).current_password}
            />
            {create.isError && !fieldErrors(create.error).current_password && (
              <Alert tone="danger" role="alert">
                {errorText(create.error, t("profile.error"))}
              </Alert>
            )}
            <Button type="submit" fullWidth disabled={!password || create.isPending}>
              {t("profile.family.createCode")}
            </Button>
          </form>
        )}
      </div>
    </WidgetCard>
  );
}

function AcceptCode({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const [code, setCode] = useState("");
  const accept = useMutation({
    mutationFn: () => api.profile.acceptInvite(code),
    onSuccess: () => {
      setCode("");
      onDone();
    },
  });
  return (
    <WidgetCard id="accept" title={t("profile.family.acceptTitle")}>
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate();
        }}
      >
        <TextField
          label={t("profile.family.code")}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          error={fieldErrors(accept.error).code}
        />
        {accept.isError && !fieldErrors(accept.error).code && (
          <Alert tone="danger" role="alert">
            {errorText(accept.error, t("profile.error"))}
          </Alert>
        )}
        {accept.isSuccess && (
          <Alert tone="success" role="status">
            {t("profile.family.accepted", { name: accept.data.display_name })}
          </Alert>
        )}
        <Button
          type="submit"
          variant="secondary"
          fullWidth
          disabled={code.replace(/[\s-]/g, "").length < 8 || accept.isPending}
        >
          {t("profile.family.accept")}
        </Button>
      </form>
    </WidgetCard>
  );
}
