import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@medilink/api-client";
import {
  Alert,
  Button,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  PasswordField,
  TextField,
} from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { useServices } from "../app/services";
import { useAuthFlow } from "../auth/auth-flow";
import { destinationAfterAuth } from "../auth/destination";
import { staffMeKey } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { EMAIL_PATTERN } from "../forms/validation";
import { AuthLayout } from "../layout/AuthLayout";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "validation.emailRequired")
    .refine((value) => EMAIL_PATTERN.test(value), "validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});
type LoginValues = z.infer<typeof loginSchema>;

const FIELD_IDS = { email: "login-email", password: "login-password" } as const;

interface LoginState {
  from?: string;
  reason?: "expired";
}

/** Staff login: email + password, then the second factor (contract §2, design 05). */
export function LoginPage() {
  const { t } = useTranslation();
  const { api, session } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { setPending } = useAuthFlow();
  const state = (location.state ?? null) as LoginState | null;

  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onValid = async (values: LoginValues) => {
    setFormError(null);
    try {
      const result = await api.staffAuth.login(values);
      session.clear();
      if (result.status === "authenticated" && result.user) {
        queryClient.setQueryData(staffMeKey, result.user);
        await navigate(destinationAfterAuth(result.user, state?.from), { replace: true });
        return;
      }
      if (result.status === "authenticated") throw new Error("authenticated without user");
      setPending({ status: result.status, email: values.email, from: state?.from });
      await navigate(
        result.status === "mfa_setup_required" ? "/login/mfa/setup" : "/login/mfa/verify",
      );
    } catch (error) {
      const fieldsApplied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["email", "password"]);
      if (!fieldsApplied) {
        setFormError(
          describeApiError(error, t, { not_authenticated: t("login.invalidCredentials") }),
        );
      }
      setAttempt((n) => n + 1);
    }
  };

  const summary = errorSummaryItems(errors, FIELD_IDS, translator(t), formError);

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <PageHeading title={t("login.title")}>{t("login.title")}</PageHeading>
          <p className="m-0 text-fg-muted">{t("login.intro")}</p>
        </div>

        {state?.reason === "expired" && <Alert tone="info" title={t("errors.sessionExpired")} />}
        <ErrorSummary items={summary} focusKey={attempt} />

        <form
          noValidate
          onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
          className="flex flex-col gap-5"
        >
          <TextField
            id={FIELD_IDS.email}
            label={t("login.email")}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            error={fieldErrorMessage(errors.email, translator(t))}
            {...register("email")}
          />
          <div className="flex flex-col gap-2">
            <PasswordField
              id={FIELD_IDS.password}
              label={t("login.password")}
              autoComplete="current-password"
              error={fieldErrorMessage(errors.password, translator(t))}
              {...register("password")}
            />
            <Link to="/forgot-password" className="self-start py-1 font-semibold">
              {t("login.forgot")}
            </Link>
          </div>
          <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
            {t("login.submit")}
          </Button>
        </form>
        <p className="m-0 text-body-sm text-fg-muted">{t("login.patientHint")}</p>
      </div>
    </AuthLayout>
  );
}
