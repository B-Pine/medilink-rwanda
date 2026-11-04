import type { ResultReview } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
} from "@medilink/ui";
import {
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  Flask,
  SealCheck,
  TestTube,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { myDayKey } from "./DoctorToday";
import { labKeys, LabStateBadge } from "./LabShared";
import { errorText, useCan, useWhen } from "./shared";

const resultsKey = (status: string) => ["clinical", "results", status] as const;

/** One outside result: what it is, whose it is, open it, then mark it reviewed. */
function ResultCard({ row }: { row: ResultReview }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const review = useMutation({
    mutationFn: () =>
      api.clinical.reviewResult(row.id, { version: row.version, comment: comment.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinical", "results"] });
      void queryClient.invalidateQueries({ queryKey: myDayKey });
    },
  });
  const open = useMutation({
    mutationFn: () => api.clinical.scanLink(row.scan.id),
    onSuccess: (link) => window.open(link.url, "_blank", "noopener,noreferrer"),
  });
  const pending = row.status === "pending";
  return (
    <li className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
          <Flask aria-hidden="true" weight="bold" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">
            {row.scan.description || t("clinical.results.untitled")}
          </span>
          <span className="text-body-sm text-fg-secondary">
            {row.patient_display_name} ·{" "}
            {t("clinical.results.dated", { date: when.date(row.scan.document_date) })}
          </span>
          <span className="text-caption text-fg-muted">
            {t("clinical.results.uploaded", {
              name: row.scan.uploaded_by_name,
              time: when.dateTime(row.scan.uploaded_at),
            })}
          </span>
        </div>
        <Badge tone={pending ? "warning" : "success"}>
          {t(`clinical.results.status.${row.status}`)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" pill loading={open.isPending} onClick={() => open.mutate()}>
          <FileText aria-hidden="true" />
          {t("clinical.results.view")}
        </Button>
        <Link
          to={`/clinical/patients/${row.facility_patient_id}/history`}
          className={buttonClassName({ variant: "ghost", pill: true })}
        >
          <ClockCounterClockwise aria-hidden="true" />
          {t("clinical.results.history")}
        </Link>
      </div>
      {pending ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <TextField
            label={t("clinical.results.comment")}
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            pill
            loading={review.isPending}
            onClick={() => review.mutate()}
            aria-label={`${t("clinical.results.markReviewed")}: ${row.scan.description}`}
          >
            <CheckCircle aria-hidden="true" weight="bold" />
            {t("clinical.results.markReviewed")}
          </Button>
        </div>
      ) : (
        <p className="m-0 rounded-xl bg-subtle/60 px-4 py-3 text-body-sm">
          {t("clinical.results.reviewedBy", {
            name: row.reviewed_by_name ?? "—",
            time: row.reviewed_at ? when.dateTime(row.reviewed_at) : "—",
          })}
          {row.comment && <span className="mt-1 block text-fg">{row.comment}</span>}
        </p>
      )}
      {(review.isError || open.isError) && (
        <Alert tone="danger" role="alert">
          {errorText(review.error ?? open.error, t("errors.generic"))}
        </Alert>
      )}
    </li>
  );
}

function ResultList({ status }: { status: "pending" | "reviewed" }) {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: resultsKey(status),
    queryFn: () => api.clinical.results({ status }),
  });
  if (list.isPending) return <Skeleton height="10rem" className="rounded-2xl" />;
  if (list.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(list.error, t("errors.generic"))}
      </Alert>
    );
  if (list.data.results.length === 0)
    return (
      <EmptyState
        icon={SealCheck}
        title={t(`clinical.results.empty.${status}`)}
        description={t("clinical.results.emptyBody")}
      />
    );
  return (
    <ul className="ml-stagger m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
      {list.data.results.map((row) => (
        <ResultCard key={row.id} row={row} />
      ))}
    </ul>
  );
}

/** #201: results of the tests I ordered here, waiting for my review or release. */
function LabInbox() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const canWrite = useCan("clinical.write");
  const inbox = useQuery({
    queryKey: labKeys.inbox,
    queryFn: () => api.clinical.lab.inbox(),
    enabled: canWrite,
  });
  if (!canWrite || !inbox.data?.length) return null;
  return (
    <section aria-labelledby="lab-inbox" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="lab-inbox" className="m-0 font-heading text-h2 tracking-tight">
          {t("clinical.lab.inbox.title")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("clinical.lab.inbox.lead")}</p>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 xl:grid-cols-2">
        {inbox.data.map(({ order, patient, facility_patient_id }) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 shadow-card"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
              <TestTube aria-hidden="true" weight="bold" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{order.test_name}</span>
              <span className="text-body-sm text-fg-secondary">
                {patient.display_name}
                {order.resulted_at && ` · ${when.time(order.resulted_at)}`}
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {order.is_abnormal && <Badge tone="danger">{t("clinical.lab.flags.abnormal")}</Badge>}
              <LabStateBadge state={order.state} />
            </span>
            <Link
              to={`/clinical/consultations/${order.consultation_id}?fp=${facility_patient_id}#lab`}
              className={buttonClassName({ variant: "secondary", pill: true })}
              aria-label={`${t("clinical.lab.inbox.open")}: ${order.test_name}, ${patient.display_name}`}
            >
              {t("clinical.lab.inbox.open")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /clinical/results (S6b R1): outside lab and imaging results assigned to me. */
export function ResultsPage() {
  const { t } = useTranslation();
  const allowed = useCan("clinical.view");
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("clinical.results.title")} description={t("clinical.results.intro")} />
      <LabInbox />
      <Tabs defaultValue="pending">
        <TabsList aria-label={t("clinical.results.title")}>
          <TabsTrigger value="pending">{t("clinical.results.tabs.pending")}</TabsTrigger>
          <TabsTrigger value="reviewed">{t("clinical.results.tabs.reviewed")}</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <ResultList status="pending" />
        </TabsContent>
        <TabsContent value="reviewed">
          <ResultList status="reviewed" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
