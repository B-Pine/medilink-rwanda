import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Printer } from "@phosphor-icons/react";
import { isApiError, type StaffMe } from "@medilink/api-client";
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  LoadingState,
  TextField,
} from "@medilink/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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

const codeSchema = z.object({
  code: z.string().superRefine((value, ctx) => {
    const code = normaliseOtp(value);
    if (!code) ctx.addIssue({ code: "custom", message: "validation.codeRequired" });
    else if (!OTP_PATTERN.test(code))
      ctx.addIssue({ code: "custom", message: "validation.codeFormat" });
  }),
});
type CodeValues = z.infer<typeof codeSchema>;

const savedSchema = z.object({
  saved: z.boolean().refine((value) => value, "validation.recoveryCodesSaved"),
});
type SavedValues = z.infer<typeof savedSchema>;

const mfaSetupKey = ["staff", "mfa-setup"] as const;

function groupKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * First login of a staff member (design 05 §3): QR rendered on the client from otpauth_uri,
 * manual key, code confirmation, then the recovery codes (shown once) to print or copy.
 */
export function MfaSetupPage() {
  const { pending } = useAuthFlow();
  const [result, setResult] = useState<{ user: StaffMe; codes: string[] } | null>(null);

  if (!pending || pending.status !== "mfa_setup_required") return <Navigate to="/login" replace />;
  return (
    <AuthLayout>
      {result ? (
        <RecoveryCodes user={result.user} codes={result.codes} from={pending.from} />
      ) : (
        <EnrolStep onConfirmed={(user, codes) => setResult({ user, codes })} />
      )}
    </AuthLayout>
  );
}

function EnrolStep({ onConfirmed }: { onConfirmed: (user: StaffMe, codes: string[]) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // POST /mfa/setup/ once per visit (the query cache de-duplicates StrictMode double mounts).
  const setup = useQuery({
    queryKey: mfaSetupKey,
    queryFn: () => api.staffAuth.mfaSetup(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  const onValid = async ({ code }: CodeValues) => {
    setFormError(null);
    try {
      const response = await api.staffAuth.mfaConfirm(normaliseOtp(code));
      queryClient.setQueryData(staffMeKey, response.user);
      queryClient.removeQueries({ queryKey: mfaSetupKey });
      onConfirmed(response.user, response.recovery_codes);
    } catch (error) {
      const applied =
        isApiError(error) && error.isValidationError && applyFieldErrors(error, setError, ["code"]);
      if (!applied) setFormError(describeApiError(error, t));
      setAttempt((n) => n + 1);
    }
  };

  const title = t("mfaSetup.title");
  const heading = (
    <div className="flex flex-col gap-2">
      <PageHeading title={title}>{title}</PageHeading>
      <p className="m-0 text-fg-muted">{t("mfaSetup.intro")}</p>
    </div>
  );

  if (setup.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <LoadingState label={t("mfaSetup.preparing")} />
      </div>
    );
  }
  if (setup.isError) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Alert tone="danger" role="alert" title={t("mfaSetup.setupFailed")}>
          {describeApiError(setup.error, t)}
        </Alert>
        <Link to="/login" className="font-semibold">
          {t("mfaVerify.backToLogin")}
        </Link>
      </div>
    );
  }

  const { otpauth_uri: uri, secret } = setup.data;
  const summary = errorSummaryItems(errors, { code: "setup-code" }, translator(t), formError);

  return (
    <div className="flex flex-col gap-6">
      {heading}
      <ErrorSummary items={summary} focusKey={attempt} />

      <section aria-labelledby="mfa-step-1" className="flex flex-col gap-1">
        <h2 id="mfa-step-1" className="m-0 text-h3">
          {t("mfaSetup.step1Title")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("mfaSetup.step1Body")}</p>
      </section>

      <section aria-labelledby="mfa-step-2" className="flex flex-col gap-3">
        <h2 id="mfa-step-2" className="m-0 text-h3">
          {t("mfaSetup.step2Title")}
        </h2>
        <div className="self-start rounded-md border border-border bg-qr-bg p-3 text-qr-fg">
          <QRCodeSVG
            value={uri}
            size={176}
            level="M"
            marginSize={1}
            bgColor="transparent"
            fgColor="currentColor"
            role="img"
            aria-label={t("mfaSetup.qrLabel")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <p className="m-0 font-semibold" id="mfa-manual-key-label">
            {t("mfaSetup.manualKeyLabel")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              aria-labelledby="mfa-manual-key-label"
              className="rounded-sm bg-subtle px-2 py-1 font-mono text-body tracking-wider break-all"
            >
              {groupKey(secret)}
            </code>
            <Button
              variant="secondary"
              iconStart={<Copy aria-hidden="true" className="size-5" />}
              onClick={() => void copyText(secret).then(setKeyCopied)}
            >
              {t("mfaSetup.copyKey")}
            </Button>
            <span role="status" className="text-body-sm text-success">
              {keyCopied ? t("common.copied") : ""}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="mfa-step-3" className="flex flex-col gap-3">
        <h2 id="mfa-step-3" className="m-0 text-h3">
          {t("mfaSetup.step3Title")}
        </h2>
        <form
          noValidate
          onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
          className="flex flex-col gap-5"
        >
          <TextField
            id="setup-code"
            label={t("mfaSetup.code")}
            hint={t("mfaSetup.codeHint")}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            inputClassName="max-w-56 text-h2 tracking-[0.3em] tabular-nums"
            error={fieldErrorMessage(errors.code, translator(t))}
            {...register("code")}
          />
          <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
            {t("mfaSetup.submit")}
          </Button>
        </form>
      </section>
    </div>
  );
}

function RecoveryCodes({
  user,
  codes,
  from,
}: {
  user: StaffMe;
  codes: string[];
  from?: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SavedValues>({ resolver: zodResolver(savedSchema), defaultValues: { saved: false } });

  // `pending` is not cleared here: this page stays mounted until the router transition commits,
  // and its guard would bounce to /login. Logout and the next login reset it.
  const onValid = () => navigate(destinationAfterAuth(user, from), { replace: true });

  const title = t("mfaSetup.codesTitle");
  const summary = errorSummaryItems(errors, { saved: "codes-saved" }, translator(t));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 print:hidden">
        <PageHeading title={title}>{title}</PageHeading>
        <p className="m-0 text-fg-secondary">{t("mfaSetup.codesIntro")}</p>
      </div>
      <ErrorSummary items={summary} focusKey={attempt} className="print:hidden" />

      <Card as="section" aria-labelledby="codes-title" className="flex flex-col gap-4">
        <p className="m-0 hidden font-semibold print:block">
          {t("mfaSetup.printTitle", { email: user.email })}
        </p>
        <h2 id="codes-title" className="m-0 text-h3">
          {t("mfaSetup.codesListLabel")}
        </h2>
        <ol className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-2 p-0 font-mono text-body tabular-nums">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="secondary"
            iconStart={<Printer aria-hidden="true" className="size-5" />}
            onClick={() => window.print()}
          >
            {t("mfaSetup.print")}
          </Button>
          <Button
            variant="secondary"
            iconStart={<Copy aria-hidden="true" className="size-5" />}
            onClick={() => void copyText(codes.join("\n")).then(setCopied)}
          >
            {t("mfaSetup.copyCodes")}
          </Button>
          <span role="status" className="text-body-sm text-success">
            {copied ? t("mfaSetup.codesCopied") : ""}
          </span>
        </div>
      </Card>

      <form
        noValidate
        onSubmit={handleSubmit(onValid, () => setAttempt((n) => n + 1))}
        className="flex flex-col gap-5 print:hidden"
      >
        <CheckboxField
          id="codes-saved"
          label={t("mfaSetup.savedConfirm")}
          error={fieldErrorMessage(errors.saved, translator(t))}
          {...register("saved")}
        />
        <Button type="submit" size="lg" fullWidth>
          {t("mfaSetup.finish")}
        </Button>
      </form>
    </div>
  );
}
