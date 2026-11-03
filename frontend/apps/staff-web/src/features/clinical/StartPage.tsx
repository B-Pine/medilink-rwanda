import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  LoadingState,
  TicketNumber,
} from "@medilink/ui";
import { MegaphoneSimple, Notepad, Stethoscope } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { MyDayStrip, useMyDay } from "./DoctorToday";
import { errorText, isReasonRequired, useCan } from "./shared";

/** Opens (or returns) my draft for a visit (C1) and goes to it. */
function useOpen() {
  const api = useApi();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (visitId: string) => api.clinical.open(visitId),
    onSuccess: (c) => void navigate(`/clinical/consultations/${c.id}?fp=${c.facility_patient_id}`),
  });
}

/**
 * /clinical/consultation (design 04 §3.2): the consultation beside My queue. Shows the doctor's
 * current patient from the S4 queue and opens the record for that visit.
 */
export function StartPage() {
  const { t } = useTranslation();
  const api = useApi();
  const allowed = useCan("clinical.write");
  const mine = useQuery({
    queryKey: ["queue", "mine"],
    queryFn: () => api.queue.mine(),
    enabled: allowed,
  });
  const open = useOpen();
  const day = useMyDay(allowed);
  if (!allowed) return <NoAccessContent />;
  const current = mine.data?.current ?? null;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader title={t("clinical.start.title")} description={t("clinical.start.description")} />
      {day.data && <MyDayStrip data={day.data} />}
      {mine.isPending ? (
        <LoadingState label={t("clinical.loading")} />
      ) : mine.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(mine.error, t("errors.generic"))}
        </Alert>
      ) : current ? (
        <section
          aria-labelledby="current-patient"
          className="flex animate-rise flex-wrap items-center gap-5 rounded-2xl bg-surface p-6 shadow-card"
        >
          <TicketNumber number={current.number} size="lg" stub />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 id="current-patient" className="m-0 font-heading text-h1 tracking-tight">
              {current.display_name}
            </h2>
            {current.age_years !== null && (
              <span className="text-fg-secondary">
                {t("clinical.age", { count: current.age_years })}
                {current.service_point ? ` · ${current.service_point}` : ""}
              </span>
            )}
            <span>
              <Badge tone="info">
                {t(
                  `clinical.start.state.${current.state === "in_service" ? "in_service" : "called"}`,
                )}
              </Badge>
            </span>
          </div>
          <Button
            size="lg"
            pill
            loading={open.isPending}
            onClick={() => open.mutate(current.visit_id)}
            disabled={open.isPending}
          >
            <Notepad aria-hidden="true" className="size-icon" />
            {t("clinical.start.open")}
          </Button>
        </section>
      ) : (
        <EmptyState
          icon={Stethoscope}
          title={t("clinical.start.none")}
          description={t("clinical.start.noneBody")}
          action={
            <Link to="/queue/mine" className={buttonClassName({})}>
              <MegaphoneSimple aria-hidden="true" className="size-icon" />
              {t("clinical.start.toQueue")}
            </Link>
          }
        />
      )}
      {open.isError && (
        <Alert tone="danger" role="alert">
          {errorText(open.error, t("errors.generic"))}
        </Alert>
      )}
    </div>
  );
}

/** /clinical/visits/:visitId/consultation: link target from other screens (opens, then redirects). */
export function OpenForVisitPage() {
  const { t } = useTranslation();
  const { visitId = "" } = useParams();
  const allowed = useCan("clinical.write");
  const open = useOpen();
  const started = useRef(false);
  useEffect(() => {
    if (allowed && !started.current) {
      started.current = true;
      open.mutate(visitId);
    }
  }, [allowed, open, visitId]);
  if (!allowed) return <NoAccessContent />;
  if (open.isError)
    return (
      <Alert tone={isReasonRequired(open.error) ? "warning" : "danger"} role="alert">
        {errorText(open.error, t("errors.generic"))}
      </Alert>
    );
  return <LoadingState label={t("clinical.loading")} />;
}
