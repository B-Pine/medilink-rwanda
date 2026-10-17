import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { isApiError } from "@medilink/api-client";
import {
  Button,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  PasswordField,
  TextField,
} from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { patientMeKey } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { EMAIL_PATTERN } from "../forms/validation";
import { PublicLayout } from "../layout/PublicLayout";

const schema = z
  .object({
    step: z.enum(["email", "password"]),
    email: z
      .string()
      .trim()
      .min(1, "validation.emailRequired")
      .refine((value) => EMAIL_PATTERN.test(value), "validation.emailInvalid"),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.step === "password" && !values.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "validation.passwordRequired" });
    }
  });
type Values = z.infer<typeof schema>;

const FIELD_IDS = { email: "login-email", password: "login-password" } as const;

function safeReturnPath(from: unknown): string {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//")
    ? from
    : "/home";
}

/**
 * Email-first login (design 05 §2): email, then password, with a clear way to create an account
 * with the same email. The API has no "does this email exist" endpoint (it would enable account
 * enumeration), so the person chooses on the second step.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from = (location.state as { from?: string } | null)?.from;

  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { step: "email", email: "", password: "" },
  });
  const step = useWatch({ control, name: "step" });
  const email = useWatch({ control, name: "email" });

  useEffect(() => {
    if (step === "password") setFocus("password");
  }, [step, setFocus]);

  const onValid = async (values: Values) => {
    setFormError(null);
    if (values.step === "email") {
      setValue("step", "password");
      return;
    }
    try {
      const me = await api.patientAuth.login({ email: values.email, password: values.password });
      queryClient.setQueryData(patientMeKey, me);
      await navigate(safeReturnPath(from), { replace: true });
    } catch (error) {
      const applied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["email", "password"]);
      if (!applied) {
        setFormError(
          describeApiError(error, t, { not_authenticated: t("login.invalidCredentials") }),
        );
      }
      setAttempt((n) => n + 1);
    }
  };

  const changeEmail = () => {
    clearErrors();
    setFormError(null);
    setValue("step", "email");
    setTimeout(() => setFocus("email"), 0);
  };

  const fields: Record<string, string> = step === "email" ? { email: FIELD_IDS.email } : FIELD_IDS;
  const summary = errorSummaryItems(errors, fields, translator(t), formError);
  const title = step === "email" ? t("login.title") : t("login.passwordTitle");

  return (
    <PublicLayout narrow showLogin={false}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <PageHeading title={title}>{title}</PageHeading>
          {step === "email" && <p className="m-0 text-fg-secondary">{t("login.intro")}</p>}
        </div>
        <ErrorSummary items={summary} focusKey={attempt} />
        <form
          noValidate
          onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
          className="flex flex-col gap-6"
        >
          {step === "email" ? (
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
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="m-0 font-semibold break-all">{t("login.loggingInAs", { email })}</p>
                <button
                  type="button"
                  onClick={changeEmail}
                  className="min-h-target cursor-pointer p-0 font-semibold text-link underline underline-offset-4"
                >
                  {t("login.changeEmail")}
                </button>
              </div>
              {/* Keeps the username next to the password for password managers. */}
              <input hidden type="email" autoComplete="username" value={email} readOnly />
              <div className="flex flex-col gap-2">
                <PasswordField
                  id={FIELD_IDS.password}
                  label={t("login.password")}
                  autoComplete="current-password"
                  error={fieldErrorMessage(errors.password, translator(t))}
                  {...register("password")}
                />
                <Link
                  to="/forgot-password"
                  className="inline-flex min-h-target items-center self-start font-semibold"
                >
                  {t("login.forgot")}
                </Link>
              </div>
            </>
          )}
          <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
            {step === "email" ? t("login.continue") : t("login.submit")}
          </Button>
        </form>

        {step === "password" && (
          <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
            <p className="m-0 font-semibold">{t("login.newHere")}</p>
            <Link
              to="/signup"
              state={{ email }}
              className="inline-flex min-h-target items-center gap-2 font-semibold"
            >
              {t("login.createAccount")}
              <ArrowRight aria-hidden="true" className="size-5" />
            </Link>
          </div>
        )}

        <Link
          to="/"
          className="inline-flex min-h-target items-center gap-2 self-start font-semibold"
        >
          <MagnifyingGlass aria-hidden="true" className="size-5" />
          {t("login.guest")}
        </Link>
      </div>
    </PublicLayout>
  );
}
