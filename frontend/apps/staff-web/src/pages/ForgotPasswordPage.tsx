import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@medilink/api-client";
import {
  Alert,
  Button,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  TextField,
} from "@medilink/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { EMAIL_PATTERN } from "../forms/validation";
import { AuthLayout } from "../layout/AuthLayout";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "validation.emailRequired")
    .refine((value) => EMAIL_PATTERN.test(value), "validation.emailInvalid"),
});
type Values = z.infer<typeof schema>;

/** Password reset request: always the same answer, whether or not the account exists. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onValid = async ({ email }: Values) => {
    setFormError(null);
    try {
      await api.passwordReset.request({ email });
      setSentTo(email);
    } catch (error) {
      const applied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["email"]);
      if (!applied) setFormError(describeApiError(error, t));
      setAttempt((n) => n + 1);
    }
  };

  const title = sentTo ? t("forgot.sentTitle") : t("forgot.title");
  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <PageHeading title={title}>{title}</PageHeading>
        {sentTo ? (
          <Alert tone="success" role="status" title={t("forgot.sentTitle")}>
            {t("forgot.sentBody", { email: sentTo })}
          </Alert>
        ) : (
          <>
            <p className="m-0 text-fg-secondary">{t("forgot.intro")}</p>
            <ErrorSummary
              items={errorSummaryItems(errors, { email: "forgot-email" }, translator(t), formError)}
              focusKey={attempt}
            />
            <form
              noValidate
              onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
              className="flex flex-col gap-5"
            >
              <TextField
                id="forgot-email"
                label={t("forgot.email")}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                error={fieldErrorMessage(errors.email, translator(t))}
                {...register("email")}
              />
              <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                {t("forgot.submit")}
              </Button>
            </form>
          </>
        )}
        <Link to="/login" className="self-start font-semibold">
          {t("forgot.back")}
        </Link>
      </div>
    </AuthLayout>
  );
}
