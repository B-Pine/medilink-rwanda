import { isApiError, type GoogleConsentRequired, type LanguageCode } from "@medilink/api-client";
import { Alert, Button, CheckboxField } from "@medilink/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../app/services";
import { describeApiError } from "../forms/api-errors";
import { PRIVACY_VERSION, TERMS_VERSION } from "../forms/validation";
import { patientMeKey } from "./queries";

/** Google Identity Services, loaded only when the button is shown (allowed by the CSP). */
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup";
    use_fedcm_for_button?: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: "standard";
      theme: "outline" | "filled_blue";
      size: "large";
      shape: "pill";
      text: "continue_with" | "signup_with";
      width: number;
      locale: string;
      logo_alignment: "left";
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gsiLoading: Promise<GoogleId> | null = null;

function loadGsi(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  gsiLoading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () =>
      window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("gsi"));
    script.onerror = () => {
      gsiLoading = null;
      reject(new Error("gsi"));
    };
    document.head.appendChild(script);
  });
  return gsiLoading;
}

/**
 * Google's own button language. Kinyarwanda isn't one: passing "rw" made Google fall back to
 * French, so a Kinyarwanda page shows the English button.
 */
const GOOGLE_LOCALE: Record<string, string> = { rw: "en", en: "en", fr: "fr" };

/**
 * "Continue with Google" for patients (upgrade 17). Hidden unless the API says it is on.
 * Google's button gives an ID token; the API checks it. A first Google sign-in shows the same
 * consents as sign-up (terms and privacy required, research optional) before the account exists.
 */
export function GoogleSignIn({
  returnTo,
  text = "continue_with",
}: {
  returnTo: string;
  text?: "continue_with" | "signup_with";
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ["patient", "google-config"],
    queryFn: () => api.patientAuth.googleConfig(),
    staleTime: Infinity,
    retry: false,
  });
  const slot = useRef<HTMLDivElement>(null);
  const [credential, setCredential] = useState<string | null>(null);
  const [consent, setConsent] = useState<GoogleConsentRequired | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const lang = (i18n.resolvedLanguage ?? "rw") as LanguageCode;

  const finish = async (token: string, withConsent: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const me = await api.patientAuth.google({
        id_token: token,
        preferred_language: lang,
        ...(withConsent
          ? {
              accepted_terms_version: TERMS_VERSION,
              accepted_privacy_version: PRIVACY_VERSION,
              research_consent: research,
            }
          : {}),
      });
      queryClient.setQueryData(patientMeKey, me);
      await navigate(returnTo, { replace: true });
    } catch (caught) {
      if (isApiError(caught) && caught.code === "consent_required") {
        setCredential(token);
        setConsent(caught.current as GoogleConsentRequired);
      } else {
        setError(describeApiError(caught, t, { not_authenticated: t("google.failed") }));
      }
    } finally {
      setBusy(false);
    }
  };
  // Google keeps the callback it was given; the ref lets it call the latest `finish`.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  const clientId = config.data?.enabled ? config.data.client_id : "";
  useEffect(() => {
    if (!clientId || consent) return;
    let cancelled = false;
    loadGsi().then(
      (gsi) => {
        if (cancelled || !slot.current) return;
        gsi.initialize({
          client_id: clientId,
          ux_mode: "popup",
          use_fedcm_for_button: true,
          callback: (response) => {
            if (response.credential) void finishRef.current(response.credential, false);
          },
        });
        slot.current.replaceChildren();
        gsi.renderButton(slot.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text,
          width: Math.min(400, slot.current.clientWidth || 320),
          locale: GOOGLE_LOCALE[lang] ?? "en",
          logo_alignment: "left",
        });
      },
      () => !cancelled && setUnavailable(true),
    );
    return () => {
      cancelled = true;
    };
  }, [clientId, consent, lang, text]);

  if (!clientId || unavailable) return null;

  if (consent && credential) {
    return (
      <section aria-labelledby="google-consent" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="google-consent" className="m-0 text-h3">
            {t("google.consentTitle")}
          </h2>
          <p className="m-0 text-body-sm break-all text-fg-secondary">
            {consent.full_name ? `${consent.full_name} · ` : ""}
            {consent.email}
          </p>
        </div>
        <p className="m-0 flex flex-wrap gap-x-4 text-body-sm">
          <Link to="/privacy">{t("signup.readPrivacy")}</Link>
          <Link to="/terms">{t("signup.readTerms")}</Link>
        </p>
        <CheckboxField
          label={t("signup.terms")}
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <CheckboxField
          label={t("signup.privacy")}
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
        />
        <CheckboxField
          label={t("signup.research")}
          hint={t("signup.researchHint")}
          checked={research}
          onChange={(e) => setResearch(e.target.checked)}
        />
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            loading={busy}
            disabled={!terms || !privacy}
            onClick={() => void finish(credential, true)}
          >
            {t("google.create")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setConsent(null);
              setCredential(null);
            }}
          >
            {t("google.cancel")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        aria-hidden="true"
        className="m-0 flex items-center gap-3 text-caption font-semibold text-fg-muted uppercase before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
      >
        {t("google.or")}
      </p>
      <div ref={slot} className="flex min-h-11 w-full justify-center" aria-busy={busy} />
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </div>
  );
}
