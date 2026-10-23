import { isApiError, type ApplicantApplication } from "@medilink/api-client";
import {
  Alert,
  Button,
  buttonClassName,
  LoadingState,
  Stepper,
  type StepperStep,
} from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";
import { STEPS, stepOf, useApplication, useAutosave, type SaveState, type Step } from "./data";
import { AdminStep, DocumentsStep, FacilityStep, LocationStep } from "./steps";
import { ReviewStep } from "./ReviewStep";

const EDITABLE = new Set(["draft", "changes_requested"]);

function SaveStatus({ state }: { state: SaveState }) {
  const { t, i18n } = useTranslation();
  let text = "";
  if (state.kind === "saving") text = t("facilityApplication.save.saving");
  if (state.kind === "saved")
    text = t("facilityApplication.save.saved", {
      time: state.at.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
    });
  if (state.kind === "retrying") text = t("facilityApplication.save.retrying");
  return (
    <p className="m-0 min-h-6 text-body-sm text-fg-secondary" role="status" aria-live="polite">
      {text}
    </p>
  );
}

/** /for-facilities/apply/:id/:step — the five-step wizard (design 05 §3). */
export function WizardPage() {
  const { t } = useTranslation();
  const { id = "", step = "facility" } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const queryClient = useQueryClient();
  const app = useApplication(id);
  const autosave = useAutosave(app.data);
  const current = (STEPS as readonly string[]).includes(step) ? (step as Step) : "facility";

  if (app.isPending) return <LoadingState className="min-h-dvh" />;
  if (app.isError) {
    const gone = isApiError(app.error) && app.error.status === 404;
    return (
      <PublicLayout narrow>
        <div className="flex flex-col gap-4">
          <PageHeading title={t("facilityApplication.wizard.title")}>
            {t("facilityApplication.wizard.title")}
          </PageHeading>
          <Alert tone="warning" role="alert">
            {gone ? t("facilityApplication.wizard.sessionOver") : t("errors.generic")}
          </Alert>
          <Link to="/for-facilities#continue" className={buttonClassName({ variant: "secondary" })}>
            {t("facilityApplication.resume.linkTitle")}
          </Link>
        </div>
      </PublicLayout>
    );
  }
  const data: ApplicantApplication = app.data;
  if (!EDITABLE.has(data.status))
    return <Navigate to={`/for-facilities/apply/${id}/submitted`} replace />;

  const go = (next: Step) => {
    void autosave.flush();
    void navigate(`/for-facilities/apply/${id}/${next}`);
  };
  const index = STEPS.indexOf(current);
  const feedbackSteps = new Set(data.feedback.items.map((item) => stepOf(item.target)));
  const steps: StepperStep[] = STEPS.map((name, i) => {
    const missing = data.missing_for_submit.some((field) => stepOf(field) === name);
    const state =
      name === current
        ? "current"
        : feedbackSteps.has(name)
          ? "error"
          : !missing && i < index
            ? "complete"
            : "upcoming";
    return {
      id: name,
      label: t(`facilityApplication.steps.${name}`),
      state,
      onSelect: () => go(name),
      ...(state === "complete" ? { stateText: t("facilityApplication.wizard.completed") } : {}),
      ...(state === "error" ? { stateText: t("facilityApplication.wizard.needsAttention") } : {}),
    };
  });
  const stepFeedback = data.feedback.items.filter((item) => stepOf(item.target) === current);

  async function continueLater() {
    await autosave.flush();
    await api.onboarding.applicant.endSession(id).catch(() => undefined);
    queryClient.removeQueries({ queryKey: ["facilityApplication", id] });
    void navigate("/for-facilities", { state: { ended: true } });
  }

  const title = t(`facilityApplication.steps.${current}`);
  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-6">
        <p className="m-0 text-body-sm font-semibold text-fg-secondary">{data.facility.name}</p>
        <Stepper steps={steps} label={t("facilityApplication.wizard.stepsLabel")} />
        <PageHeading title={`${title} · ${t("facilityApplication.wizard.title")}`}>
          {title}
        </PageHeading>
        {autosave.state.kind === "conflict" && (
          <Alert tone="warning" role="alert">
            {t("facilityApplication.save.conflict")}
          </Alert>
        )}
        {autosave.state.kind === "error" && (
          <Alert tone="danger" role="alert">
            {autosave.state.message || t("errors.generic")}
          </Alert>
        )}
        {data.status === "changes_requested" &&
          (data.feedback.general_comment || stepFeedback.length > 0) && (
            <Alert tone="warning" title={t("facilityApplication.wizard.changesRequested")}>
              {data.feedback.general_comment && (
                <p className="mt-0">{data.feedback.general_comment}</p>
              )}
              {stepFeedback.length > 0 && (
                <ul className="m-0 pl-5">
                  {stepFeedback.map((item) => (
                    <li key={item.target}>{item.comment}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

        {current === "facility" && <FacilityStep app={data} save={autosave.save} />}
        {current === "location" && <LocationStep app={data} save={autosave.save} />}
        {current === "documents" && <DocumentsStep app={data} />}
        {current === "admin" && <AdminStep app={data} save={autosave.save} />}
        {current === "review" && <ReviewStep app={data} flush={autosave.flush} onEdit={go} />}

        <SaveStatus state={autosave.state} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="secondary" onClick={() => go(STEPS[index - 1]!)}>
                {t("facilityApplication.wizard.back")}
              </Button>
            )}
            {index < STEPS.length - 1 && (
              <Button onClick={() => go(STEPS[index + 1]!)}>
                {t("facilityApplication.wizard.next")}
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={() => void continueLater()}>
            {t("facilityApplication.wizard.continueLater")}
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
