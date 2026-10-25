import { newIdempotencyKey, type Invite, type Sex } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  ConfirmDialog,
  LoadingState,
  PasswordField,
  SelectField,
  TextField,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { can, ProfileLayout, useProfiles, useRelationshipLabel } from "./ProfileLayout";
import { CONSENT_VERSION, errorText, fieldErrors, formatDateTime, useLocale } from "./shared";

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
  return (
    <ProfileLayout title={t("profile.family.title")}>
      <Card as="section" aria-labelledby="profiles" padding="md" className="flex flex-col gap-2">
        <h2 id="profiles" className="m-0 text-h3">
          {t("profile.family.profiles")}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(profiles.data?.results ?? []).map((p) => (
            <li key={p.patient_id} className="flex flex-wrap items-center gap-2">
              <Link to={`/profile/${p.patient_id}`}>{p.display_name}</Link>
              <Badge tone="neutral">{label(p.relationship)}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <AddDependent onDone={refresh} />
      <Invite />
      <AcceptCode onDone={refresh} />
      {delegations.isPending && <LoadingState />}
      {d && (
        <Card as="section" aria-labelledby="access" padding="md" className="flex flex-col gap-3">
          <h2 id="access" className="m-0 text-h3">
            {t("profile.family.access")}
          </h2>
          {[...d.granted, ...d.received].length === 0 && d.pending_invites.length === 0 && (
            <p className="m-0 text-fg-muted">{t("profile.family.noAccess")}</p>
          )}
          {d.granted.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <span>
                {t("profile.family.grantedRow", {
                  holder: row.holder_name,
                  profile: row.profile_name,
                })}
              </span>
              <Badge tone="neutral">{label(row.relationship)}</Badge>
              {row.can_revoke && (
                <Button
                  variant="ghost"
                  onClick={() => setRevoking({ id: row.id, name: row.holder_name ?? "" })}
                >
                  {t("profile.family.revoke")}
                </Button>
              )}
            </div>
          ))}
          {d.received.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <span>{t("profile.family.receivedRow", { profile: row.profile_name })}</span>
              <Button
                variant="ghost"
                onClick={() => setRevoking({ id: row.id, name: row.profile_name })}
              >
                {t("profile.family.leave")}
              </Button>
            </div>
          ))}
          {d.pending_invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center gap-2">
              <span>
                {t("profile.family.pendingRow", {
                  profile: invite.profile_name,
                  date: formatDateTime(invite.expires_at, locale, false),
                })}
              </span>
              <Button
                variant="ghost"
                onClick={() => setRevoking({ id: invite.id, name: invite.profile_name })}
              >
                {t("profile.family.cancelInvite")}
              </Button>
            </div>
          ))}
        </Card>
      )}
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
    </ProfileLayout>
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
  if (!open)
    return (
      <Button variant="secondary" size="lg" onClick={() => setOpen(true)}>
        {t("profile.family.add")}
      </Button>
    );
  return (
    <Card
      as="form"
      padding="md"
      className="flex flex-col gap-3"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2 className="m-0 text-h3">{t("profile.family.add")}</h2>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={!form.full_name || !form.sex || add.isPending}>
          {t("profile.save")}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
          {t("profile.cancel")}
        </Button>
      </div>
    </Card>
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
    <Card as="section" aria-labelledby="invite" padding="md" className="flex flex-col gap-3">
      <h2 id="invite" className="m-0 text-h3">
        {t("profile.family.inviteTitle")}
      </h2>
      {invite ? (
        <div className="flex flex-col gap-2">
          <p className="m-0">{t("profile.family.codeOnce")}</p>
          <p
            className="m-0 font-mono text-h1 tracking-widest"
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
          <Button type="submit" size="lg" disabled={!password || create.isPending}>
            {t("profile.family.createCode")}
          </Button>
        </form>
      )}
    </Card>
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
    <Card
      as="form"
      padding="md"
      className="flex flex-col gap-3"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        accept.mutate();
      }}
    >
      <h2 className="m-0 text-h3">{t("profile.family.acceptTitle")}</h2>
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
        size="lg"
        disabled={code.replace(/[\s-]/g, "").length < 8 || accept.isPending}
      >
        {t("profile.family.accept")}
      </Button>
    </Card>
  );
}
