import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@medilink/api-client";
import {
  Alert,
  Button,
  buttonClassName,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  PasswordField,
} from "@medilink/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { PATIENT_PASSWORD_MIN } from "../forms/validation";
import { PublicLayout } from "../layout/PublicLayout";

const schema = z.object({
  new_password: z.string().min(PATIENT_PASSWORD_MIN, "validation.passwordLength"),
});
type Values = z.infer<typeof schema>;

/** Landing page of the emailed reset link: /reset-password?uid=…&token=… (one-time token). */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { new_password: "" } });

  const onValid = async ({ new_password }: Values) => {
    setFormError(null);
    try {
      await api.passwordReset.confirm({ uid, token, new_password });
      setDone(true);
    } catch (error) {
      const applied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["new_password"]);
      const tokenError = isApiError(error)
        ? (error.fieldError("token") ?? error.fieldError("uid"))
        : undefined;
      if (tokenError) setFormError(tokenError);
      else if (!applied) setFormError(describeApiError(error, t));
      setAttempt((n) => n + 1);
    }
  };

  const title = done ? t("reset.doneTitle") : t("reset.title");
  return (
    <PublicLayout narrow showLogin={false}>
      <div className="flex flex-col gap-6">
        <PageHeading title={title}>{title}</PageHeading>
        {done ? (
          <>
            <Alert tone="success" role="status" title={t("reset.doneTitle")}>
              {t("reset.doneBody")}
            </Alert>
            <Link to="/login" className={buttonClassName({ size: "lg", fullWidth: true })}>
              {t("reset.toLogin")}
            </Link>
          </>
        ) : !uid || !token ? (
          <Alert tone="warning" title={t("reset.invalidLink")}>
            <Link to="/forgot-password">{t("forgot.title")}</Link>
          </Alert>
        ) : (
          <>
            <ErrorSummary
              items={errorSummaryItems(
                errors,
                { new_password: "reset-password" },
                translator(t),
                formError,
              )}
              focusKey={attempt}
            />
            <form
              noValidate
              onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
              className="flex flex-col gap-6"
            >
              <PasswordField
                id="reset-password"
                label={t("reset.newPassword")}
                hint={t("reset.hint")}
                autoComplete="new-password"
                error={fieldErrorMessage(errors.new_password, translator(t))}
                {...register("new_password")}
              />
              <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                {t("reset.submit")}
              </Button>
            </form>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
