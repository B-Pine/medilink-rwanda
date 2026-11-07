import type { StaffMe } from "@medilink/api-client";
import { Alert, Button, Card, SelectField, TextField } from "@medilink/ui";
import { SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { staffMeKey, useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { errorText, fieldErrors } from "./shared";

/**
 * /account: my name, work phone and language (PATCH /staff/auth/me/, audit-logged). The facility
 * admin sees the phone on the team list; the language is also the app's language.
 */
export function AccountPage() {
  const { t } = useTranslation();
  const { data: me } = useStaffMe();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t("setup.account.title")} />
      {me && <AccountForm me={me} />}
    </div>
  );
}

function AccountForm({ me }: { me: StaffMe }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: me.full_name,
    phone: me.phone,
    preferred_language: me.preferred_language,
  });
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.staffAuth.updateMe(form),
    onSuccess: (next) => {
      queryClient.setQueryData<StaffMe>(staffMeKey, next);
      setForm({
        full_name: next.full_name,
        phone: next.phone,
        preferred_language: next.preferred_language,
      });
      setSaved(true);
      if (i18n.resolvedLanguage !== next.preferred_language)
        void i18n.changeLanguage(next.preferred_language);
    },
  });
  const errors = fieldErrors(save.error);
  const changed =
    form.full_name !== me.full_name ||
    form.phone !== me.phone ||
    form.preferred_language !== me.preferred_language;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    save.mutate();
  }

  return (
    <Card className="flex flex-col gap-4">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={t("setup.account.email")}
          value={me.email}
          readOnly
          hint={t("setup.account.emailHint")}
        />
        <TextField
          label={t("setup.account.fullName")}
          autoComplete="name"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          error={errors.full_name}
        />
        <TextField
          label={t("setup.account.phone")}
          hint={t("setup.account.phoneHint")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          error={errors.phone}
        />
        <SelectField
          label={t("setup.account.language")}
          value={form.preferred_language}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              preferred_language: e.target.value as StaffMe["preferred_language"],
            }))
          }
          error={errors.preferred_language}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language} value={language} lang={language}>
              {t(`language.names.${language}`, { ns: "ui" })}
            </option>
          ))}
        </SelectField>
        {saved && !changed && (
          <Alert tone="success" role="status">
            {t("setup.account.saved")}
          </Alert>
        )}
        {save.isError && Object.keys(errors).length === 0 && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
        <Button type="submit" className="self-start" disabled={!changed || save.isPending}>
          {t("setup.account.save")}
        </Button>
      </form>
    </Card>
  );
}
