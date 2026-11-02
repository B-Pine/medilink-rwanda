import { OUTCOMES_FOR, type DisputeOutcome, type StaffDispute } from "@medilink/api-client";
import { Alert, Badge, Button, LoadingState, SelectField, TextareaField } from "@medilink/ui";
import { ChatCircleText, LockKey, Scales, UserCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { useStepUp } from "../lock";
import { disputesKeys, errorText, STATUS_TONE, useCan, useWhen } from "./shared";

type Scope = "facility" | "platform";

/**
 * /disputes/:id (S10b-F2, FR-DSP-04..08): the facts first (what the patient said, the frozen audit
 * trail), then the thread with internal notes and staff comments, then what the handler can do
 * now. /platform/disputes/:id is the same page for the final decision (step-up).
 */
export function DisputePage({ scope = "facility" }: { scope?: Scope }) {
  const { t } = useTranslation();
  const api = useApi();
  const { disputeId = "" } = useParams();
  const { data: me } = useStaffMe();
  const canSee = useCan("disputes.handle", "disputes.comment");
  const allowed = scope === "platform" ? Boolean(me?.is_platform_admin) : canSee;
  const key = disputesKeys.one(scope, disputeId);
  const dispute = useQuery({
    queryKey: key,
    queryFn: () =>
      scope === "platform"
        ? api.disputes.platform.get(disputeId)
        : api.disputes.staff.get(disputeId),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  const back =
    scope === "platform"
      ? { to: "/platform/disputes", label: t("disputes.platformTitle") }
      : { to: "/disputes", label: t("disputes.title") };
  if (dispute.isPending) return <LoadingState label={t("disputes.loading")} />;
  if (dispute.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(dispute.error, t("errors.generic"))}
      </Alert>
    );
  const d = dispute.data;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={d.patient_display_name}
        back={back}
        description={`${t(`disputes.type.${d.type}`)} · ${t(`disputes.subject.${d.subject_type}`)}`}
        badges={<Badge tone={STATUS_TONE[d.status]}>{t(`disputes.status.${d.status}`)}</Badge>}
      />
      <Facts d={d} />
      <Thread d={d} />
      <Decide d={d} scope={scope} queryKey={key} />
    </div>
  );
}

export function PlatformDisputePage() {
  return <DisputePage scope="platform" />;
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card"
      aria-label={title}
    >
      <h2 className="m-0 flex items-center gap-2 text-h3">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ d }: { d: StaffDispute }) {
  const { t } = useTranslation();
  const when = useWhen();
  const snapshot = Object.entries(d.subject_snapshot).filter(([, v]) => v !== null && v !== "");
  return (
    <Card
      title={t("disputes.facts")}
      icon={<Scales aria-hidden="true" weight="duotone" className="size-6 text-brand" />}
    >
      <blockquote className="m-0 border-l-2 border-brand pl-3 whitespace-pre-wrap">
        {d.description}
      </blockquote>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt className="text-fg-muted">{t("disputes.raised")}</dt>
        <dd className="m-0">
          {when.dateTime(d.created_at)}
          {d.channel === "counter" && ` · ${t("disputes.atCounter")}`}
        </dd>
        {snapshot.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{t(`disputes.snapshot.${k}`, { defaultValue: k })}</dt>
            <dd className="m-0 font-mono">{String(v)}</dd>
          </div>
        ))}
        <dt className="text-fg-muted">{t("disputes.acknowledgeBy")}</dt>
        <dd className="m-0">{when.dateTime(d.acknowledge_by)}</dd>
        {d.decide_by && (
          <>
            <dt className="text-fg-muted">{t("disputes.decideBy")}</dt>
            <dd className="m-0">{when.dateTime(d.decide_by)}</dd>
          </>
        )}
      </dl>
      {d.flagged && <Alert tone="warning">{t("disputes.flaggedBody")}</Alert>}
      <h3 className="m-0 text-body font-semibold">{t("disputes.evidence")}</h3>
      {d.evidence.length ? (
        <ol className="m-0 flex list-none flex-col gap-1 border-l border-border p-0 pl-3 text-body-sm">
          {d.evidence.map((e, i) => (
            <li key={i}>
              <span className="font-mono">{when.dateTime(e.at)}</span> ·{" "}
              {t(`disputes.audit.${e.action}`, { defaultValue: e.action })}
              {e.actor_name && ` · ${e.actor_name}`}
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-body-sm text-fg-muted">{t("disputes.noEvidence")}</p>
      )}
      {d.statement && (
        <Alert tone="info" title={t("disputes.statementTitle")}>
          {d.statement}
        </Alert>
      )}
      {d.actions.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
          {d.actions.map((a) => (
            <li key={a.id}>
              <Badge tone={a.status === "done" ? "success" : "warning"}>
                {t(`disputes.actionStatus.${a.status}`)}
              </Badge>{" "}
              {t(`disputes.outcome.${a.outcome}`)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Thread({ d }: { d: StaffDispute }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <Card
      title={t("disputes.thread")}
      icon={<ChatCircleText aria-hidden="true" weight="duotone" className="size-6 text-brand" />}
    >
      {d.messages.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {d.messages.map((m) => (
            <li
              key={m.id}
              className={
                m.visibility === "thread"
                  ? "rounded-md bg-subtle p-3"
                  : "rounded-md border border-dashed border-warning/60 p-3"
              }
            >
              <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
                {m.visibility === "thread" ? (
                  <UserCircle aria-hidden="true" className="size-icon" />
                ) : (
                  <LockKey aria-hidden="true" className="size-icon text-warning" />
                )}
                <span className="font-semibold text-fg">{m.author_name}</span>
                <span>{t(`disputes.visibility.${m.visibility}`)}</span>
                <span>{when.dateTime(m.created_at)}</span>
              </p>
              <p className="m-0 mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-fg-muted">{t("disputes.noMessages")}</p>
      )}
    </Card>
  );
}

function Decide({
  d,
  scope,
  queryKey,
}: {
  d: StaffDispute;
  scope: Scope;
  queryKey: readonly unknown[];
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const canHandle = useCan("disputes.handle") || scope === "platform";
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"thread" | "internal">("thread");
  const [outcome, setOutcome] = useState<DisputeOutcome | "">("");
  const [reason, setReason] = useState("");
  const [member, setMember] = useState("");
  const [tried, setTried] = useState(false);
  const set = (data: StaffDispute) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ["disputes", scope] });
  };
  const members = useQuery({
    queryKey: ["setup", "memberships", "active"],
    queryFn: () => api.setup.memberships({ status: "active" }),
    enabled: scope === "facility" && canHandle,
  });
  const run = useMutation({
    mutationFn: (step: "message" | "ack" | "info" | "resolve" | "ask" | "comment") => {
      const s = api.disputes.staff;
      if (scope === "platform") {
        if (step === "message") return api.disputes.platform.message(d.id, body.trim(), visibility);
        return withStepUp(() =>
          api.disputes.platform.decide(d.id, {
            version: d.version,
            outcome: outcome as DisputeOutcome,
            reason: reason.trim(),
          }),
        );
      }
      if (step === "ack") return s.acknowledge(d.id, d.version);
      if (step === "info") return s.requestInfo(d.id, d.version, body.trim());
      if (step === "ask") return s.askComment(d.id, member);
      if (step === "comment") return s.comment(d.id, body.trim());
      if (step === "resolve")
        return s.resolve(d.id, {
          version: d.version,
          outcome: outcome as DisputeOutcome,
          reason: reason.trim(),
        });
      return s.message(d.id, body.trim(), visibility);
    },
    onSuccess: (data, step) => {
      set(data);
      setTried(false);
      if (step === "message" || step === "info" || step === "comment") setBody("");
      if (step === "resolve") setReason("");
    },
  });
  const closed = ["closed", "final_decision"].includes(d.status);
  const deciding =
    scope === "platform"
      ? d.status === "escalated"
      : ["under_review", "info_requested"].includes(d.status);
  const decide = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (outcome && reason.trim().length >= 5) run.mutate("resolve");
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (body.trim().length >= 2) run.mutate(canHandle ? "message" : "comment");
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-card"
      aria-label={t("disputes.actions")}
    >
      {run.isError && (
        <Alert tone="danger" role="alert">
          {errorText(run.error, t("errors.generic"))}
        </Alert>
      )}
      {!d.can_decide && scope === "facility" && (
        <Alert tone="warning">{t("disputes.involved")}</Alert>
      )}
      {scope === "facility" &&
        canHandle &&
        d.can_decide &&
        ["open", "reopened"].includes(d.status) && (
          <Button className="self-start" loading={run.isPending} onClick={() => run.mutate("ack")}>
            {t("disputes.acknowledge")}
          </Button>
        )}

      {!closed && (
        <form noValidate onSubmit={send} className="flex flex-col gap-3">
          <TextareaField
            label={canHandle ? t("disputes.write") : t("disputes.yourComment")}
            rows={3}
            maxLength={3000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={
              tried && body.trim().length < 2 && !outcome ? t("disputes.writeRequired") : undefined
            }
          />
          {canHandle && (
            <SelectField
              label={t("disputes.visibilityLabel")}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "thread" | "internal")}
              className="sm:w-72"
            >
              <option value="thread">{t("disputes.visibility.thread")}</option>
              <option value="internal">{t("disputes.visibility.internal")}</option>
            </SelectField>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={run.isPending}>
              {canHandle ? t("disputes.send") : t("disputes.sendComment")}
            </Button>
            {scope === "facility" && canHandle && d.status === "under_review" && (
              <Button
                variant="secondary"
                disabled={body.trim().length < 2}
                onClick={() => run.mutate("info")}
              >
                {t("disputes.askPatient")}
              </Button>
            )}
          </div>
        </form>
      )}

      {scope === "facility" && canHandle && !closed && (
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t("disputes.askStaff")}
            value={member}
            onChange={(e) => setMember(e.target.value)}
            className="sm:w-72"
          >
            <option value="">{t("disputes.chooseStaff")}</option>
            {(members.data?.results ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </SelectField>
          <Button variant="secondary" disabled={!member} onClick={() => run.mutate("ask")}>
            {t("disputes.askComment")}
          </Button>
          {d.comment_requests.length > 0 && (
            <p className="m-0 w-full text-body-sm text-fg-muted">
              {d.comment_requests
                .map((r) =>
                  r.responded_at
                    ? t("disputes.commented", { name: r.member_name })
                    : t("disputes.waitingComment", { name: r.member_name }),
                )
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {canHandle && deciding && d.can_decide && (
        <form
          noValidate
          onSubmit={decide}
          aria-labelledby="decide-title"
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <h2 id="decide-title" className="m-0 text-h3">
            {scope === "platform" ? t("disputes.finalDecision") : t("disputes.decide")}
          </h2>
          <SelectField
            label={t("disputes.outcomeLabel")}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as DisputeOutcome)}
            error={tried && !outcome ? t("disputes.outcomeRequired") : undefined}
            className="sm:w-80"
          >
            <option value="">{t("disputes.chooseOutcome")}</option>
            {OUTCOMES_FOR[d.subject_type].map((o) => (
              <option key={o} value={o}>
                {t(`disputes.outcome.${o}`)}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label={t("disputes.reason")}
            hint={t("disputes.reasonHint")}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tried && reason.trim().length < 5 ? t("disputes.reasonRequired") : undefined}
          />
          <Button type="submit" className="self-start" loading={run.isPending}>
            {scope === "platform" ? t("disputes.signDecision") : t("disputes.resolve")}
          </Button>
        </form>
      )}
      {d.decision_reason && (
        <Alert tone="info" title={t(`disputes.outcome.${d.outcome || "rejected"}`)}>
          {d.decision_reason}
        </Alert>
      )}
    </section>
  );
}
