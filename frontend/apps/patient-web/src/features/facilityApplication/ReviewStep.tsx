import { isApiError, newIdempotencyKey, type ApplicantApplication } from "@medilink/api-client";
import { Alert, Button, CheckboxField } from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useApi } from "../../app/services";
import { applicationKey, STEPS, stepOf, type Step } from "./data";

interface Problem {
  field: string;
  message: string;
}

/** Review: summary with edit links, agreements, submit; server `fields` mapped to their steps. */
export function ReviewStep({
  app,
  flush,
  onEdit,
}: {
  app: ApplicantApplication;
  flush: () => Promise<void>;
  onEdit: (step: Step) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [agreements, setAgreements] = useState({ terms: false, dpa: false, ncsa: false });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (attempt && (problems.length || failure)) summaryRef.current?.focus();
  }, [attempt, problems.length, failure]);

  async function submit() {
    const local: Problem[] = [];
    if (!agreements.terms)
      local.push({
        field: "accepted_terms_version",
        message: t("facilityApplication.review.termsRequired"),
      });
    if (!agreements.dpa)
      local.push({
        field: "accepted_dpa_version",
        message: t("facilityApplication.review.dpaRequired"),
      });
    if (!agreements.ncsa)
      local.push({
        field: "ncsa_registration_confirmed",
        message: t("facilityApplication.review.ncsaRequired"),
      });
    setAttempt((n) => n + 1);
    setFailure(undefined);
    if (local.length) {
      setProblems(local);
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      await flush();
      const latest = queryClient.getQueryData<ApplicantApplication>(applicationKey(app.id)) ?? app;
      const submitted = await api.onboarding.applicant.submit(app.id, latest.version, key.current);
      queryClient.setQueryData(applicationKey(app.id), submitted);
      void navigate(`/for-facilities/apply/${app.id}/submitted`, { replace: true });
    } catch (error) {
      if (isApiError(error) && error.isValidationError) {
        setProblems(
          Object.entries(error.fields).map(([field, messages]) => ({
            field,
            message: messages[0] ?? "",
          })),
        );
      } else {
        setFailure(isApiError(error) ? error.message : t("errors.generic"));
      }
      await queryClient.invalidateQueries({ queryKey: applicationKey(app.id) });
    } finally {
      setBusy(false);
    }
  }

  const missingByStep = STEPS.map((step) => ({
    step,
    fields: app.missing_for_submit.filter((field) => stepOf(field) === step),
  })).filter((group) => group.fields.length > 0);

  const sections: { step: Step; rows: [string, string][] }[] = [
    {
      step: "facility",
      rows: [
        [t("facilityApplication.fields.facilityName"), app.facility.name],
        [t("facilityApplication.fields.facilityType"), app.facility.facility_type],
        [
          t("facilityApplication.fields.ownership"),
          app.facility.ownership
            ? t(`facilityApplication.ownership.${app.facility.ownership}`)
            : "",
        ],
        [t("facilityApplication.fields.facilityPhone"), app.facility.phone],
        [t("facilityApplication.fields.facilityEmail"), app.facility.email],
      ],
    },
    {
      step: "location",
      rows: [
        [
          t("facilityApplication.location.village"),
          app.location.path.map((p) => p.name).join(", "),
        ],
        [t("facilityApplication.location.address"), app.location.address],
      ],
    },
    {
      step: "documents",
      rows: app.documents.map((d) => [
        t(`facilityApplication.documents.kinds.${d.kind}`),
        `${d.upload.original_filename} · ${t(`facilityApplication.upload.status.${d.upload.status}`)}`,
      ]),
    },
    {
      step: "admin",
      rows: [
        [t("facilityApplication.admin.name"), app.proposed_admin.name],
        [t("facilityApplication.admin.email"), app.proposed_admin.email],
        [t("facilityApplication.admin.phone"), app.proposed_admin.phone],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {(problems.length > 0 || failure) && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border-2 border-danger bg-danger-bg p-4"
        >
          <h2 className="m-0 font-heading text-h3 text-danger">
            {t("facilityApplication.review.problemsTitle")}
          </h2>
          {failure && <p className="mb-0">{failure}</p>}
          <ul className="mb-0 pl-5">
            {problems.map((p) => {
              const step = stepOf(p.field);
              return (
                <li key={p.field}>
                  {step === "review" ? (
                    <a href={`#${p.field}`}>{p.message}</a>
                  ) : (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-link underline"
                      onClick={() => onEdit(step)}
                    >
                      {t(`facilityApplication.steps.${step}`)}:{" "}
                      {t(`facilityApplication.missing.${p.field}`, { defaultValue: p.message })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {missingByStep.length > 0 && problems.length === 0 && (
        <Alert tone="info" title={t("facilityApplication.review.stillMissing")}>
          <ul className="m-0 pl-5">
            {missingByStep.map((group) => (
              <li key={group.step}>
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-left text-link underline"
                  onClick={() => onEdit(group.step)}
                >
                  {t(`facilityApplication.steps.${group.step}`)}
                </button>
                :{" "}
                {group.fields
                  .map((f) => t(`facilityApplication.missing.${f}`, { defaultValue: f }))
                  .join(", ")}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {sections.map((section) => (
        <section key={section.step} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 font-heading text-h3">
              {t(`facilityApplication.steps.${section.step}`)}
            </h2>
            <Button
              variant="ghost"
              onClick={() => onEdit(section.step)}
              aria-label={`${t("facilityApplication.review.edit")}: ${t(`facilityApplication.steps.${section.step}`)}`}
            >
              {t("facilityApplication.review.edit")}
            </Button>
          </div>
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {section.rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="m-0 mb-2 sm:mb-0">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 font-heading text-h3">
          {t("facilityApplication.review.agreements")}
        </legend>
        <CheckboxField
          id="accepted_terms_version"
          label={t("facilityApplication.review.terms")}
          checked={agreements.terms}
          onChange={(e) => setAgreements((a) => ({ ...a, terms: e.target.checked }))}
        />
        <CheckboxField
          id="accepted_dpa_version"
          label={t("facilityApplication.review.dpa")}
          checked={agreements.dpa}
          onChange={(e) => setAgreements((a) => ({ ...a, dpa: e.target.checked }))}
        />
        <CheckboxField
          id="ncsa_registration_confirmed"
          label={t("facilityApplication.review.ncsa")}
          checked={agreements.ncsa}
          onChange={(e) => setAgreements((a) => ({ ...a, ncsa: e.target.checked }))}
        />
      </fieldset>
      <Button size="lg" loading={busy} onClick={() => void submit()}>
        {t("facilityApplication.review.submit")}
      </Button>
    </div>
  );
}
