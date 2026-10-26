import type { RoleCode, InvitationLookup, StaffMe } from "@medilink/api-client";
import { Alert, Badge, Button, LoadingState, PasswordField, TextField } from "@medilink/ui";
import { Buildings, EnvelopeSimpleOpen } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { useAuthFlow } from "../../auth/auth-flow";
import { staffMeKey } from "../../auth/queries";
import { PageHeading } from "../../components/PageHeading";
import { roleLabel } from "../../facility/labels";
import { AuthLayout } from "../../layout/AuthLayout";
import { errorText, fieldErrors, formatDate, useLocale } from "./shared";

/**
 * /invite/:token (S2-F8, FR-ACC-05): who invited you and to what; a new account sets a name and
 * password then MFA, an existing account signs in and accepts. Bad or expired links get one
 * generic message (no hint about which part was wrong).
 */
export function InvitePage() {
  const { t } = useTranslation();
  const api = useApi();
  const { token = "" } = useParams();
  const lookup = useMutation({ mutationFn: () => api.setup.lookupInvitation(token) });
  const { mutate } = lookup;
  useEffect(() => mutate(), [mutate]);

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <PageHeading title={t("setup.invite.title")}>{t("setup.invite.title")}</PageHeading>
        {lookup.isPending && <LoadingState />}
        {lookup.isError && (
          <Alert tone="danger" role="alert" title={t("setup.invite.invalidTitle")}>
            {t("setup.invite.invalid")}
          </Alert>
        )}
        {lookup.data && <Invitation token={token} invitation={lookup.data} />}
      </div>
    </AuthLayout>
  );
}

function Invitation({ token, invitation }: { token: string; invitation: InvitationLookup }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const signedIn = queryClient.getQueryData<StaffMe>(staffMeKey);
  return (
    <>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-subtle p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-brand-subtle text-on-brand-subtle">
            <Buildings aria-hidden="true" weight="duotone" className="size-6" />
          </span>
          <div className="flex flex-col">
            <span className="font-heading text-h3">{invitation.facility_name}</span>
            {invitation.invited_by && (
              <span className="text-body-sm text-fg-secondary">
                {t("setup.invite.invitedBy", { name: invitation.invited_by })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {invitation.role_codes.map((r) => (
            <Badge key={r} tone="brand">
              {roleLabel(r as RoleCode, t)}
            </Badge>
          ))}
        </div>
        <p className="m-0 flex items-center gap-2 text-body-sm text-fg-secondary">
          <EnvelopeSimpleOpen aria-hidden="true" className="size-4" />
          {invitation.email_masked} ·{" "}
          {t("setup.invite.expires", { date: formatDate(invitation.expires_at, locale) })}
        </p>
      </section>
      {invitation.account_exists ? (
        signedIn ? (
          <AcceptExisting token={token} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-fg-secondary">{t("setup.invite.existingHint")}</p>
            <Link
              to="/login"
              state={{ from: `/invite/${token}` }}
              className="inline-flex min-h-control-primary items-center justify-center rounded-md bg-primary px-5 font-semibold text-on-primary no-underline hover:bg-primary-hover"
            >
              {t("setup.invite.logInToAccept")}
            </Link>
          </div>
        )
      ) : (
        <NewAccount token={token} email={invitation.email_masked} />
      )}
    </>
  );
}

function AcceptExisting({ token }: { token: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.setup.acceptInvitation({ token }),
    onSuccess: (me) => {
      if ("memberships" in me) queryClient.setQueryData(staffMeKey, me);
      void navigate("/select-facility", { replace: true });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      {accept.isError && (
        <Alert tone="danger" role="alert">
          {errorText(accept.error, t("setup.failed"))}
        </Alert>
      )}
      <Button size="lg" fullWidth onClick={() => accept.mutate()} disabled={accept.isPending}>
        {t("setup.invite.accept")}
      </Button>
    </div>
  );
}

function NewAccount({ token, email }: { token: string; email: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { setPending } = useAuthFlow();
  const [form, setForm] = useState({ full_name: "", password: "" });
  const accept = useMutation({
    mutationFn: () => api.setup.acceptInvitation({ token, ...form }),
    onSuccess: () => {
      setPending({ status: "mfa_setup_required", email });
      void navigate("/login/mfa/setup", { replace: true });
    },
  });
  const errors = fieldErrors(accept.error);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        accept.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <p className="m-0 text-fg-secondary">{t("setup.invite.newHint")}</p>
      <TextField
        label={t("setup.invite.fullName")}
        autoComplete="name"
        value={form.full_name}
        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        error={errors.full_name}
      />
      <PasswordField
        label={t("setup.invite.password")}
        hint={t("setup.invite.passwordHint")}
        autoComplete="new-password"
        value={form.password}
        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        error={errors.password}
      />
      {accept.isError && Object.keys(errors).length === 0 && (
        <Alert tone="danger" role="alert">
          {t("setup.invite.invalid")}
        </Alert>
      )}
      <Button type="submit" size="lg" fullWidth disabled={accept.isPending}>
        {t("setup.invite.create")}
      </Button>
    </form>
  );
}
