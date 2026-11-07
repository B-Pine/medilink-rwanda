import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@medilink/api-client";
import { Alert, Button, fieldErrorMessage, PasswordField } from "@medilink/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { PATIENT_PASSWORD_MIN } from "../forms/validation";

const schema = z.object({
  current_password: z.string().min(1, "validation.passwordRequired"),
  new_password: z.string().min(PATIENT_PASSWORD_MIN, "validation.passwordLength"),
});
type Values = z.infer<typeof schema>;

/**
 * Change password while signed in (security 03 §6): the current one, then the new one. Other
 * sessions end on the server; this browser stays signed in.
 */
export function ChangePasswordForm({ email }: { email?: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "" },
  });

  const onValid = async (values: Values) => {
    setFormError(null);
    setDone(false);
    try {
      await api.patientAuth.changePassword(values);
      reset();
      setDone(true);
    } catch (error) {
      const applied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["current_password", "new_password"]);
      if (!applied) setFormError(describeApiError(error, t));
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid)}
      className="flex flex-col gap-4 px-5 py-4"
      aria-label={t("dashboard.settings.security.change")}
    >
      <p className="m-0 text-body-sm text-fg-secondary">
        {t("dashboard.settings.security.password")}
      </p>
      {done && (
        <Alert tone="success" role="status">
          {t("dashboard.settings.security.done")}
        </Alert>
      )}
      {formError && (
        <Alert tone="danger" role="alert">
          {formError}
        </Alert>
      )}
      <input type="email" autoComplete="username" value={email ?? ""} readOnly hidden />
      <PasswordField
        id="settings-current-password"
        label={t("dashboard.settings.security.current")}
        autoComplete="current-password"
        error={fieldErrorMessage(errors.current_password, translator(t))}
        {...register("current_password")}
      />
      <PasswordField
        id="settings-new-password"
        label={t("dashboard.settings.security.new")}
        hint={t("reset.hint")}
        autoComplete="new-password"
        error={fieldErrorMessage(errors.new_password, translator(t))}
        {...register("new_password")}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={isSubmitting}>
          {t("dashboard.settings.security.change")}
        </Button>
        <Link to="/forgot-password" state={{ email }} className="text-body-sm">
          {t("dashboard.settings.security.forgot")}
        </Link>
      </div>
    </form>
  );
}
