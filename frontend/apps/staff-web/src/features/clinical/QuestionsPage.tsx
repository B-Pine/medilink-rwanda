import type { PharmacyQuestion } from "@medilink/api-client";
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
  TextareaField,
} from "@medilink/ui";
import { ChatCircleDots, CheckCircle, Notepad, PaperPlaneRight, Pill } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { useStepUp } from "../lock";
import { myDayKey } from "./DoctorToday";
import { errorText, useCan, useWhen } from "./shared";

const questionsKey = (status: "open" | "answered") => ["clinical", "questions", status] as const;

/** One question: who asks what about which medicine; answer right here. */
function QuestionCard({ q }: { q: PharmacyQuestion }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [answer, setAnswer] = useState("");
  const [tried, setTried] = useState(false);
  const reply = useMutation({
    mutationFn: () => withStepUp(() => api.clinical.reply(q.id, answer.trim())),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinical", "questions"] });
      void queryClient.invalidateQueries({ queryKey: myDayKey });
    },
  });
  const open = q.status === "open";
  const send = () => {
    setTried(true);
    if (answer.trim().length >= 2) reply.mutate();
  };
  return (
    <li className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-attention-bg text-attention">
          <ChatCircleDots aria-hidden="true" weight="bold" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{q.patient_display_name}</span>
          <span className="text-body-sm text-fg-secondary tabular-nums">
            {t("clinical.questions.from", {
              name: q.raised_by_name,
              time: when.dateTime(q.raised_at),
            })}
          </span>
        </div>
        <Badge tone={open ? "warning" : "success"}>
          {t(`clinical.questions.status.${q.status}`)}
        </Badge>
      </div>
      {q.items.length > 0 && (
        <ul
          aria-label={t("clinical.questions.medicines")}
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {q.items.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-body-sm"
            >
              <Pill aria-hidden="true" className="size-3.5 text-fg-secondary" />
              {item}
            </li>
          ))}
        </ul>
      )}
      <blockquote className="m-0 rounded-xl border-s-4 border-attention/50 bg-attention-bg/40 px-4 py-3">
        {q.message}
      </blockquote>
      {open ? (
        <div className="flex flex-col gap-3">
          <TextareaField
            label={t("clinical.questions.answer")}
            hint={t("clinical.questions.answerHint")}
            rows={2}
            maxLength={2000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            error={
              tried && answer.trim().length < 2 ? t("clinical.questions.answerRequired") : undefined
            }
          />
          {reply.isError && (
            <Alert tone="danger" role="alert">
              {errorText(reply.error, t("errors.generic"))}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button pill loading={reply.isPending} onClick={send}>
              <PaperPlaneRight aria-hidden="true" weight="bold" />
              {t("clinical.questions.send")}
            </Button>
            <Link
              to={`/clinical/consultations/${q.consultation_id}?fp=${q.facility_patient_id}#prescription`}
              className={buttonClassName({ variant: "ghost", pill: true })}
            >
              <Notepad aria-hidden="true" />
              {t("clinical.questions.openRecord")}
            </Link>
          </div>
        </div>
      ) : (
        q.answered_at && (
          <p className="m-0 flex items-center gap-2 text-body-sm text-fg-secondary">
            <CheckCircle aria-hidden="true" weight="fill" className="size-4 text-success" />
            {t("clinical.questions.answeredAt", { time: when.dateTime(q.answered_at) })}
          </p>
        )
      )}
    </li>
  );
}

function QuestionList({ status }: { status: "open" | "answered" }) {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: questionsKey(status),
    queryFn: () => api.clinical.questions(status),
    refetchInterval: status === "open" ? 30_000 : false,
  });
  if (list.isPending) return <Skeleton height="10rem" className="rounded-2xl" />;
  if (list.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(list.error, t("errors.generic"))}
      </Alert>
    );
  if (list.data.length === 0)
    return (
      <EmptyState
        icon={CheckCircle}
        title={t(`clinical.questions.empty.${status}`)}
        description={t("clinical.questions.emptyBody")}
      />
    );
  return (
    <ul className="ml-stagger m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
      {list.data.map((q) => (
        <QuestionCard key={q.id} q={q} />
      ))}
    </ul>
  );
}

/** /clinical/questions (upgrade 05 §3): pharmacy questions on my prescriptions. */
export function QuestionsPage() {
  const { t } = useTranslation();
  const allowed = useCan("prescription.issue");
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("clinical.questions.title")} />
      <Tabs defaultValue="open">
        <TabsList aria-label={t("clinical.questions.title")}>
          <TabsTrigger value="open">{t("clinical.questions.tabs.open")}</TabsTrigger>
          <TabsTrigger value="answered">{t("clinical.questions.tabs.answered")}</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <QuestionList status="open" />
        </TabsContent>
        <TabsContent value="answered">
          <QuestionList status="answered" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
