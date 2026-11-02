import { isApiError } from "@medilink/api-client";
import { Alert, buttonClassName, LoadingState } from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useApi } from "../app/services";
import { patientMeKey } from "../auth/queries";
import { describeApiError } from "../forms/api-errors";
import { AuthLayout, AuthTitle } from "../layout/AuthLayout";

/**
 * Landing page of the sign-up email: /verify-email?token=… (single use, security 03 §6).
 * Confirms the email, which activates the account and signs the patient in, then goes home.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false); // the token works once: never post it twice (StrictMode re-runs effects)

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api.patientAuth
      .verifyEmail({ token })
      .then(async (me) => {
        queryClient.setQueryData(patientMeKey, me);
        await navigate("/home", { replace: true });
      })
      .catch((caught: unknown) => {
        setError(
          (isApiError(caught) ? caught.fieldError("token") : undefined) ??
            describeApiError(caught, t),
        );
      });
  }, [api, navigate, queryClient, t, token]);

  const title = error ? t("verifyEmail.failedTitle") : t("verifyEmail.title");
  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <AuthTitle title={title} />
        {!token || error ? (
          <>
            <Alert tone="warning" title={t("verifyEmail.failedTitle")}>
              {error ?? t("verifyEmail.invalidLink")}
            </Alert>
            <Link to="/signup" className={buttonClassName({ size: "lg", fullWidth: true })}>
              {t("verifyEmail.signUpAgain")}
            </Link>
          </>
        ) : (
          <LoadingState label={t("verifyEmail.working")} />
        )}
      </div>
    </AuthLayout>
  );
}
