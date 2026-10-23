import { isApiError } from "@medilink/api-client";
import { Alert, Button, buttonClassName, Card, ErrorSummary, TextField } from "@medilink/ui";
import { isLanguage } from "@medilink/ui/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { describeApiError } from "../../forms/api-errors";
import { EMAIL_PATTERN } from "../../forms/validation";
import { PublicLayout } from "../../layout/PublicLayout";
import { applicationKey, firstIncompleteStep, useApplication } from "./data";

const ROLES = ["admin", "reception", "doctor", "pharmacy"] as const;
const PHASES = ["apply", "verify", "setup", "live"] as const;
const FAQ = ["cost", "documents", "time", "data"] as const;

/** /for-facilities (design 06 §4): what MediLink does for a facility, how onboarding works. */
export function ForFacilitiesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const ended = (location.state as { ended?: boolean } | null)?.ended;
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
        {ended && (
          <Alert tone="success" role="status">
            {t("facilityApplication.public.sessionEnded")}
          </Alert>
        )}
        <section className="flex flex-col gap-4">
          <PageHeading title={t("facilityApplication.public.title")}>
            {t("facilityApplication.public.title")}
          </PageHeading>
          <p className="m-0 max-w-3xl text-body-lg text-fg-secondary">
            {t("facilityApplication.public.problem")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/for-facilities/apply" className={buttonClassName({ size: "lg" })}>
              {t("facilityApplication.public.register")}
            </Link>
            <a href="#continue" className={buttonClassName({ size: "lg", variant: "secondary" })}>
              {t("facilityApplication.public.continue")}
            </a>
          </div>
        </section>

        <section aria-labelledby="roles-title" className="flex flex-col gap-4">
          <h2 id="roles-title" className="m-0 font-heading text-h2">
            {t("facilityApplication.public.rolesTitle")}
          </h2>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
            {ROLES.map((role) => (
              <li key={role}>
                <Card className="h-full">
                  <h3 className="m-0 font-heading text-h3">
                    {t(`facilityApplication.public.roles.${role}.title`)}
                  </h3>
                  <p className="mt-2 mb-0 text-fg-secondary">
                    {t(`facilityApplication.public.roles.${role}.body`)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-title" className="flex flex-col gap-4">
          <h2 id="how-title" className="m-0 font-heading text-h2">
            {t("facilityApplication.public.howTitle")}
          </h2>
          <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-4">
            {PHASES.map((phase, index) => (
              <li key={phase} className="flex flex-col gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 items-center justify-center rounded-full bg-brand-subtle font-bold text-on-brand-subtle"
                >
                  {index + 1}
                </span>
                <h3 className="m-0 font-heading text-h3">
                  {t(`facilityApplication.public.phases.${phase}.title`)}
                </h3>
                <p className="m-0 text-fg-secondary">
                  {t(`facilityApplication.public.phases.${phase}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="faq-title" className="flex flex-col gap-3">
          <h2 id="faq-title" className="m-0 font-heading text-h2">
            {t("facilityApplication.public.faqTitle")}
          </h2>
          {FAQ.map((item) => (
            <details key={item} className="rounded-md border border-border bg-surface px-4 py-3">
              <summary className="cursor-pointer font-semibold">
                {t(`facilityApplication.public.faq.${item}.q`)}
              </summary>
              <p className="mt-2 mb-0 text-fg-secondary">
                {t(`facilityApplication.public.faq.${item}.a`)}
              </p>
            </details>
          ))}
        </section>

        <section id="continue" aria-labelledby="continue-title" className="max-w-xl">
          <ResumeLinkForm headingId="continue-title" />
        </section>
      </div>
    </PublicLayout>
  );
}

/** "Send me a link" form: always the same answer, whether the email is known or not. */
function ResumeLinkForm({ headingId }: { headingId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(t("facilityApplication.validation.email"));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await api.onboarding.applicant.requestResumeLinks(email.trim());
      setSent(true);
    } catch (failure) {
      setError(describeApiError(failure, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 id={headingId} className="m-0 font-heading text-h3">
        {t("facilityApplication.resume.linkTitle")}
      </h2>
      <p className="mt-2 text-fg-secondary">{t("facilityApplication.resume.linkBody")}</p>
      {sent ? (
        <Alert tone="success" role="status">
          {t("facilityApplication.resume.linkSent")}
        </Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <TextField
            label={t("facilityApplication.fields.email")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <div>
            <Button type="submit" loading={busy}>
              {t("facilityApplication.resume.send")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** /for-facilities/apply: applicant and facility name; explains the resume email. */
export function StartPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    facility_name: "",
    website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.facility_name.trim())
      next.facility_name = t("facilityApplication.validation.required");
    if (!values.name.trim()) next.name = t("facilityApplication.validation.required");
    if (!EMAIL_PATTERN.test(values.email.trim()))
      next.email = t("facilityApplication.validation.email");
    setErrors(next);
    setAttempt((n) => n + 1);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const language = i18n.resolvedLanguage ?? i18n.language;
      const app = await api.onboarding.applicant.start({
        applicant: {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          position: values.position.trim(),
        },
        facility_name: values.facility_name.trim(),
        preferred_language: isLanguage(language) ? language : "rw",
        ...(values.website ? { website: values.website } : {}),
      });
      queryClient.setQueryData(applicationKey(app.id), app);
      void navigate(`/for-facilities/apply/${app.id}/facility`);
    } catch (error) {
      setFailure(describeApiError(error, t));
    } finally {
      setBusy(false);
    }
  }

  const ids: Record<string, string> = {
    facility_name: "start-facility",
    name: "start-name",
    email: "start-email",
  };
  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-6">
        <PageHeading title={t("facilityApplication.start.title")}>
          {t("facilityApplication.start.title")}
        </PageHeading>
        <p className="m-0 text-fg-secondary">{t("facilityApplication.start.intro")}</p>
        <ErrorSummary
          focusKey={attempt}
          items={Object.entries(errors).map(([key, message]) => ({ fieldId: ids[key], message }))}
        />
        {failure && (
          <Alert tone="danger" role="alert">
            {failure}
          </Alert>
        )}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
          <TextField
            id="start-facility"
            label={t("facilityApplication.fields.facilityName")}
            value={values.facility_name}
            onChange={set("facility_name")}
            error={errors.facility_name}
          />
          <TextField
            id="start-name"
            label={t("facilityApplication.fields.yourName")}
            autoComplete="name"
            value={values.name}
            onChange={set("name")}
            error={errors.name}
          />
          <TextField
            id="start-email"
            label={t("facilityApplication.fields.email")}
            hint={t("facilityApplication.start.emailHint")}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set("email")}
            error={errors.email}
          />
          <TextField
            label={t("facilityApplication.fields.phone")}
            type="tel"
            autoComplete="tel"
            optional
            value={values.phone}
            onChange={set("phone")}
          />
          <TextField
            label={t("facilityApplication.fields.position")}
            optional
            value={values.position}
            onChange={set("position")}
          />
          {/* Honeypot: hidden from people, filled by bots. */}
          <div aria-hidden="true" className="sr-only">
            <label>
              {t("facilityApplication.start.honeypot")}
              <input
                tabIndex={-1}
                autoComplete="off"
                value={values.website}
                onChange={set("website")}
              />
            </label>
          </div>
          <Button type="submit" size="lg" loading={busy}>
            {t("facilityApplication.start.submit")}
          </Button>
        </form>
      </div>
    </PublicLayout>
  );
}

/** /for-facilities/apply/resume?token=…: exchanges the token, removes it from the address bar. */
export function ResumePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const token = useRef(params.get("token"));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const value = token.current;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!value) {
      setInvalid(true);
      return;
    }
    let cancelled = false;
    api.onboarding.applicant
      .resume(value)
      .then((app) => {
        if (cancelled) return;
        queryClient.setQueryData(applicationKey(app.id), app);
        void navigate(`/for-facilities/apply/${app.id}/${firstIncompleteStep(app)}`, {
          replace: true,
        });
      })
      .catch(() => !cancelled && setInvalid(true));
    return () => {
      cancelled = true;
    };
  }, [api, navigate, queryClient]);

  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-6">
        <PageHeading title={t("facilityApplication.resume.title")}>
          {t("facilityApplication.resume.title")}
        </PageHeading>
        {invalid ? (
          <>
            <Alert tone="warning" role="alert">
              {t("facilityApplication.resume.invalid")}
            </Alert>
            <ResumeLinkForm headingId="resume-again" />
          </>
        ) : (
          <p className="m-0 text-fg-secondary" role="status">
            {t("facilityApplication.resume.opening")}
          </p>
        )}
      </div>
    </PublicLayout>
  );
}

/** /for-facilities/apply/:id/submitted */
export function SubmittedPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const app = useApplication(id);
  const status = app.data?.status;
  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-6">
        <PageHeading title={t("facilityApplication.submitted.title")}>
          {t("facilityApplication.submitted.title")}
        </PageHeading>
        {app.isError && isApiError(app.error) && app.error.status === 404 ? (
          <Alert tone="info">{t("facilityApplication.submitted.sessionOver")}</Alert>
        ) : (
          status && (
            <Alert tone="success" role="status">
              {t("facilityApplication.submitted.status", {
                status: t(`facilityApplication.status.${status}`),
              })}
            </Alert>
          )
        )}
        <ol className="m-0 flex flex-col gap-3 pl-5">
          <li>{t("facilityApplication.submitted.next1")}</li>
          <li>{t("facilityApplication.submitted.next2")}</li>
          <li>{t("facilityApplication.submitted.next3")}</li>
        </ol>
        <Link to="/" className={buttonClassName({ variant: "secondary" })}>
          {t("facilityApplication.submitted.home")}
        </Link>
      </div>
    </PublicLayout>
  );
}
