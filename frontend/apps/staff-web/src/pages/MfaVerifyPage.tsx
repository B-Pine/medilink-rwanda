import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError, type MfaVerifyRequest } from "@medilink/api-client";
import {
  Button,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  TextField,
} from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { useAuthFlow } from "../auth/auth-flow";
import { destinationAfterAuth } from "../auth/destination";
import { staffMeKey } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import { normaliseOtp, OTP_PATTERN } from "../forms/validation";
import { AuthLayout } from "../layout/AuthLayout";

const schema = z
  .object({
    code: z.string(),
    recovery_code: z.string(),
    mode: z.enum(["app", "recovery"]),
  })
  .superRefine((values, ctx) => {
    if (values.mode === "app") {
      const code = normaliseOtp(values.code);
      if (!code)
        ctx.addIssue({ code: "custom", path: ["code"], message: "validation.codeRequired" });
      else if (!OTP_PATTERN.test(code))
        ctx.addIssue({ code: "custom", path: ["code"], message: "validation.codeFormat" });
    } else if (!values.recovery_code.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["recovery_code"],
        message: "validation.recoveryCodeRequired",
      });
    }
  });
type Values = z.infer<typeof schema>;

const FIELD_IDS = { code: "mfa-code", recovery_code: "mfa-recovery-code" } as const;

/**
 * Second factor for enrolled staff (design 05 §2): one input (not six boxes) so paste and
 * `autocomplete="one-time-code"` work, plus a recovery-code option.
 */
export function MfaVerifyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pending, setPending } = useAuthFlow();
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const switched = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    clearErrors,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", recovery_code: "", mode: "app" },
  });
  const mode = useWatch({ control, name: "mode" });

  useEffect(() => {
    if (!switched.current) return;
    setFocus(mode === "app" ? "code" : "recovery_code");
  }, [mode, setFocus]);

  if (!pending || pending.status !== "mfa_required") return <Navigate to="/login" replace />;

  const switchMode = () => {
    switched.current = true;
    clearErrors();
    setFormError(null);
    setValue("mode", mode === "app" ? "recovery" : "app");
  };

  const onValid = async (values: Values) => {
    setFormError(null);
    const body: MfaVerifyRequest =
      values.mode === "app"
        ? { code: normaliseOtp(values.code) }
        : { recovery_code: values.recovery_code.trim() };
    try {
      const result = await api.staffAuth.mfaVerify(body);
      queryClient.setQueryData(staffMeKey, result.user);
      // `pending` is not cleared here: this page is still mounted until the router transition
      // commits, and its guard would bounce to /login. Logout and the next login reset it.
      await navigate(destinationAfterAuth(result.user, pending.from), { replace: true });
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        // The half-open session is gone (expired or reset): start again.
        setPending(null);
        await navigate("/login", { replace: true, state: { reason: "expired" } });
        return;
      }
      const applied =
        isApiError(error) &&
        error.isValidationError &&
        applyFieldErrors(error, setError, ["code", "recovery_code"]);
      if (!applied) setFormError(describeApiError(error, t));
      setAttempt((n) => n + 1);
    }
  };

  const fields: Record<string, string> =
    mode === "app" ? { code: FIELD_IDS.code } : { recovery_code: FIELD_IDS.recovery_code };
  const summary = errorSummaryItems(errors, fields, translator(t), formError);
  const title = mode === "app" ? t("mfaVerify.title") : t("mfaVerify.recoveryTitle");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <PageHeading title={title}>{title}</PageHeading>
          <p className="m-0 text-fg-muted">
            {mode === "app" ? t("mfaVerify.intro") : t("mfaVerify.recoveryIntro")}
          </p>
        </div>
        <ErrorSummary items={summary} focusKey={attempt} />
        <form
          noValidate
          onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
          className="flex flex-col gap-5"
        >
          {mode === "app" ? (
            <TextField
              id={FIELD_IDS.code}
              label={t("mfaVerify.code")}
              hint={t("mfaVerify.codeHint")}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              inputClassName="max-w-56 text-h2 tracking-[0.3em] tabular-nums"
              error={fieldErrorMessage(errors.code, translator(t))}
              {...register("code")}
            />
          ) : (
            <TextField
              id={FIELD_IDS.recovery_code}
              label={t("mfaVerify.recoveryCode")}
              hint={t("mfaVerify.recoveryHint")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputClassName="max-w-64 font-mono"
              error={fieldErrorMessage(errors.recovery_code, translator(t))}
              {...register("recovery_code")}
            />
          )}
          <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
            {t("mfaVerify.submit")}
          </Button>
        </form>
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={switchMode}
            className="min-h-target cursor-pointer p-0 font-semibold text-link underline underline-offset-4"
          >
            {mode === "app" ? t("mfaVerify.useRecovery") : t("mfaVerify.useApp")}
          </button>
          <Link to="/login" onClick={() => setPending(null)} className="font-semibold">
            {t("mfaVerify.backToLogin")}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
