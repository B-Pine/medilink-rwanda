import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { isApiError } from "@medilink/api-client";
import {
  Button,
  CheckboxField,
  cx,
  ErrorSummary,
  errorSummaryItems,
  fieldErrorMessage,
  PasswordField,
  SelectField,
  SERVER_ERROR_TYPE,
  TextField,
} from "@medilink/ui";
import { isLanguage, SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { useApi } from "../app/services";
import { patientMeKey } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { applyFieldErrors, describeApiError, translator } from "../forms/api-errors";
import {
  EMAIL_PATTERN,
  PATIENT_PASSWORD_MIN,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "../forms/validation";
import { PublicLayout } from "../layout/PublicLayout";

const schema = z.object({
  full_name: z.string().trim().min(1, "validation.nameRequired"),
  email: z
    .string()
    .trim()
    .min(1, "validation.emailRequired")
    .refine((value) => EMAIL_PATTERN.test(value), "validation.emailInvalid"),
  password: z.string().min(PATIENT_PASSWORD_MIN, "validation.passwordLength"),
  preferred_language: z.enum(["rw", "en", "fr"]),
  accepted_terms: z.boolean().refine((value) => value, "validation.termsRequired"),
  accepted_privacy: z.boolean().refine((value) => value, "validation.privacyRequired"),
  research_consent: z.boolean(),
});
type Values = z.infer<typeof schema>;

const DETAILS_FIELDS = {
  full_name: "signup-name",
  email: "signup-email",
  password: "signup-password",
  preferred_language: "signup-language",
} as const;
const CONSENT_FIELDS = {
  accepted_terms: "signup-terms",
  accepted_privacy: "signup-privacy",
} as const;
const DETAILS_NAMES = Object.keys(DETAILS_FIELDS) as Path<Values>[];

/**
 * Patient sign-up (design 05, FR-PAT-02, FR-SEC-04/05): details, then a consent step where terms
 * and privacy are required and research consent is optional and unticked. Logged in right after.
 */
export function SignUpPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";
  const uiLanguage = i18n.resolvedLanguage;

  const [step, setStep] = useState<1 | 2>(1);
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const stepChanged = useRef(false);
  const headingRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      email: initialEmail,
      password: "",
      preferred_language: isLanguage(uiLanguage) ? uiLanguage : "rw",
      accepted_terms: false,
      accepted_privacy: false,
      research_consent: false,
    },
  });
  const password = useWatch({ control, name: "password" });
  const passwordLongEnough = password.length >= PATIENT_PASSWORD_MIN;

  useEffect(() => {
    if (stepChanged.current) headingRef.current?.querySelector("h1")?.focus();
  }, [step]);

  const goToStep = (next: 1 | 2) => {
    stepChanged.current = true;
    setFormError(null);
    setStep(next);
  };

  const continueToConsent = async () => {
    if (await trigger(DETAILS_NAMES)) goToStep(2);
    else setAttempt((n) => n + 1);
  };

  const onValid = async (values: Values) => {
    setFormError(null);
    try {
      const me = await api.patientAuth.register({
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        preferred_language: values.preferred_language,
        accepted_terms_version: TERMS_VERSION,
        accepted_privacy_version: PRIVACY_VERSION,
        research_consent: values.research_consent,
      });
      queryClient.setQueryData(patientMeKey, me);
      await navigate("/home", { replace: true });
    } catch (error) {
      if (isApiError(error) && error.isValidationError) {
        // Details errors go back to step 1; consent errors stay on step 2.
        const onDetails = applyFieldErrors(error, setError, DETAILS_NAMES);
        const termsError = error.fieldError("accepted_terms_version");
        const privacyError = error.fieldError("accepted_privacy_version");
        if (termsError)
          setError("accepted_terms", { type: SERVER_ERROR_TYPE, message: termsError });
        if (privacyError) {
          setError("accepted_privacy", { type: SERVER_ERROR_TYPE, message: privacyError });
        }
        if (onDetails) goToStep(1);
        else if (!termsError && !privacyError) setFormError(describeApiError(error, t));
      } else {
        setFormError(describeApiError(error, t));
      }
      setAttempt((n) => n + 1);
    }
  };

  const fields = step === 1 ? DETAILS_FIELDS : CONSENT_FIELDS;
  const summary = errorSummaryItems(errors, fields, translator(t), formError);
  const title = step === 1 ? t("signup.title") : t("signup.consentTitle");

  return (
    <PublicLayout narrow showLogin={false}>
      <div className="flex flex-col gap-6">
        <div ref={headingRef} className="flex flex-col gap-2">
          <p className="m-0 text-body-sm font-semibold text-fg-muted">
            {t("signup.step", { current: step, total: 2 })}
          </p>
          <PageHeading title={title}>{title}</PageHeading>
          {step === 1 && <p className="m-0 text-fg-secondary">{t("signup.intro")}</p>}
        </div>
        <ErrorSummary items={summary} focusKey={attempt} />

        <form
          noValidate
          onSubmit={(event) => {
            // Enter on step 1 means "Continue", not "Create account".
            if (step === 1) {
              event.preventDefault();
              void continueToConsent();
              return;
            }
            void handleSubmit(onValid, () => setAttempt((n) => n + 1))(event);
          }}
          className="flex flex-col gap-6"
        >
          <div className={cx("flex flex-col gap-6", step !== 1 && "hidden")}>
            <TextField
              id={DETAILS_FIELDS.full_name}
              label={t("signup.fullName")}
              hint={t("signup.fullNameHint")}
              autoComplete="name"
              error={fieldErrorMessage(errors.full_name, translator(t))}
              {...register("full_name")}
            />
            <TextField
              id={DETAILS_FIELDS.email}
              label={t("signup.email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              error={fieldErrorMessage(errors.email, translator(t))}
              {...register("email")}
            />
            <div className="flex flex-col gap-2">
              <PasswordField
                id={DETAILS_FIELDS.password}
                label={t("signup.password")}
                hint={t("signup.passwordHint")}
                autoComplete="new-password"
                error={fieldErrorMessage(errors.password, translator(t))}
                {...register("password")}
              />
              {/* Rule shown before typing and ticked live (design 05 §1). */}
              <p
                className={cx(
                  "m-0 flex items-center gap-2 text-body-sm font-semibold",
                  passwordLongEnough ? "text-success" : "text-fg-muted",
                )}
              >
                {passwordLongEnough ? (
                  <CheckCircle aria-hidden="true" weight="fill" className="size-5" />
                ) : (
                  <Circle aria-hidden="true" className="size-5" />
                )}
                {t("signup.passwordRule")}
                <span className="sr-only">
                  {passwordLongEnough
                    ? t("signup.passwordRuleMet")
                    : t("signup.passwordRuleNotMet")}
                </span>
              </p>
            </div>
            <SelectField
              id={DETAILS_FIELDS.preferred_language}
              label={t("signup.language")}
              hint={t("signup.languageHint")}
              {...register("preferred_language")}
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language} value={language} lang={language}>
                  {t(`language.names.${language}`, { ns: "ui" })}
                </option>
              ))}
            </SelectField>
            <Button type="submit" size="lg" fullWidth>
              {t("signup.continue")}
            </Button>
          </div>

          <div className={cx("flex flex-col gap-6", step !== 2 && "hidden")}>
            <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
              <p className="m-0 font-semibold">{t("signup.consentIntro")}</p>
              <ul className="m-0 flex list-disc flex-col gap-2 pl-6">
                <li>{t("signup.consentPoint1")}</li>
                <li>{t("signup.consentPoint2")}</li>
                <li>{t("signup.consentPoint3")}</li>
              </ul>
              <div className="flex flex-col gap-1">
                <Link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold"
                >
                  {t("signup.readPrivacy")}{" "}
                  <span className="font-normal">{t("common.opensInNewTab")}</span>
                </Link>
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold"
                >
                  {t("signup.readTerms")}{" "}
                  <span className="font-normal">{t("common.opensInNewTab")}</span>
                </Link>
              </div>
            </div>
            <CheckboxField
              id={CONSENT_FIELDS.accepted_terms}
              label={t("signup.terms")}
              error={fieldErrorMessage(errors.accepted_terms, translator(t))}
              {...register("accepted_terms")}
            />
            <CheckboxField
              id={CONSENT_FIELDS.accepted_privacy}
              label={t("signup.privacy")}
              error={fieldErrorMessage(errors.accepted_privacy, translator(t))}
              {...register("accepted_privacy")}
            />
            <CheckboxField
              id="signup-research"
              label={t("signup.research")}
              hint={t("signup.researchHint")}
              {...register("research_consent")}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button variant="secondary" size="lg" onClick={() => goToStep(1)}>
                {t("common.back")}
              </Button>
              <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                {t("signup.submit")}
              </Button>
            </div>
          </div>
        </form>

        <p className="m-0">
          {t("signup.haveAccount")}{" "}
          <Link to="/login" className="font-semibold">
            {t("signup.login")}
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
