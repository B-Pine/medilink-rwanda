import type { MergeRequest, MergeSide, MergeStatus } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  LoadingState,
  SidePanel,
  type BadgeTone,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeading } from "../../components/PageHeading";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import { actionError, formatDate, Gate, useCan, useLocale } from "./shared";

const STATUSES: (MergeStatus | "")[] = [
  "requested",
  "executed",
  "rejected",
  "cancelled",
  "undone",
  "",
];
const TONES: Record<MergeStatus, BadgeTone> = {
  requested: "info",
  executed: "success",
  rejected: "danger",
  cancelled: "neutral",
  undone: "warning",
};

type Action = "approve" | "reject" | "cancel" | "escalate" | "undo";

/** /patients/merge-requests (ST18–ST25). */
export function MergesPage() {
  return (
    <Gate codes={["patients.merge_request", "patients.merge_approve"]}>
      <Merges platform={false} />
    </Gate>
  );
}

/** /platform/merge-requests (PL1–PL5): cross-facility, escalated and claim merges. */
export function PlatformMergesPage() {
  const { t } = useTranslation();
  const { data: me } = useStaffMe();
  if (!me?.is_platform_admin)
    return <PageHeading title={t("patients.notFound")}>{t("patients.notFound")}</PageHeading>;
  return <Merges platform />;
}

function Merges({ platform }: { platform: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const [status, setStatus] = useState<MergeStatus | "">("requested");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["patients", "merges", platform, status],
    queryFn: () =>
      platform ? api.patients.platform.merges({ status }) : api.patients.merges({ status }),
  });
  const title = platform ? t("patients.nav.platformMerges") : t("patients.nav.merges");
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title={title} />
      <div role="group" aria-label={t("patients.merges.filter")} className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s || "all"}
            variant={status === s ? "primary" : "secondary"}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s ? t(`patients.merges.status.${s}`) : t("patients.merges.all")}
          </Button>
        ))}
      </div>
      {list.isPending && <LoadingState />}
      {list.data && list.data.results.length === 0 && (
        <p className="m-0">{t("patients.merges.none")}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.data?.results.map((merge) => (
          <li key={merge.id}>
            <button
              type="button"
              onClick={() => setOpenId(merge.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 text-left"
            >
              <Badge tone={TONES[merge.status]}>
                {t(`patients.merges.status.${merge.status}`)}
              </Badge>
              <span className="font-medium">
                {merge.surviving.full_name} ← {merge.merged.full_name}
              </span>
              <span className="text-body-sm text-fg-muted">
                {t(`patients.merges.scope.${merge.scope}`)}
                {merge.is_escalated ? ` · ${t("patients.merges.escalated")}` : ""} ·{" "}
                {formatDate(merge.requested_at, locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {openId && <MergePanel id={openId} platform={platform} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Side({ title, side }: { title: string; side: MergeSide }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <div className="flex-1 rounded-md border border-border p-3">
      <h3 className="m-0 mb-1 text-body-sm text-fg-muted">{title}</h3>
      <p className="m-0 font-medium">{side.full_name}</p>
      <p className="m-0 text-body-sm">
        {formatDate(side.date_of_birth, locale)} · {side.sex ? t(`patients.sex.${side.sex}`) : "—"}
      </p>
      <p className="m-0 font-mono text-body-sm">{side.medilink_number}</p>
      <p className="m-0 text-body-sm">
        {t("patients.fields.fileNumber")} {side.file_number ?? "—"}
      </p>
    </div>
  );
}

function MergePanel({
  id,
  platform,
  onClose,
}: {
  id: string;
  platform: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { data: me } = useStaffMe();
  const { withStepUp } = useStepUp();
  const canApprove = useCan("patients.merge_approve") || platform;
  const [action, setAction] = useState<Action | null>(null);
  const merge = useQuery({
    queryKey: ["patients", "merge", platform, id],
    queryFn: () => (platform ? api.patients.platform.merge(id) : api.patients.merge(id)),
  });
  const run = useMutation({
    mutationFn: ({
      act,
      reason,
      m,
    }: {
      act: Action;
      reason: string;
      m: MergeRequest;
    }): Promise<unknown> => {
      const p = api.patients;
      switch (act) {
        case "approve":
          return withStepUp(() =>
            platform
              ? p.platform.approve(m.id, { version: m.version, decision_reason: reason })
              : p.approveMerge(m.id, { version: m.version, decision_reason: reason }),
          );
        case "reject":
          return platform
            ? p.platform.reject(m.id, { version: m.version, decision_reason: reason })
            : p.rejectMerge(m.id, { version: m.version, decision_reason: reason });
        case "undo":
          return withStepUp(() =>
            platform
              ? p.platform.undo(m.id, { version: m.version, reason })
              : p.undoMerge(m.id, { version: m.version, reason }),
          );
        case "cancel":
          return p.cancelMerge(m.id);
        case "escalate":
          return p.escalateMerge(m.id);
      }
    },
    onSuccess: () => {
      setAction(null);
      void queryClient.invalidateQueries({ queryKey: ["patients", "merges"] });
      void queryClient.invalidateQueries({ queryKey: ["patients", "merge"] });
    },
  });
  const m = merge.data;
  const isRequester = m && me ? m.requested_by === me.full_name : false;
  const open = m?.status === "requested";
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("patients.merges.panelTitle")}
      closeLabel={t("patients.close")}
    >
      {!m && <LoadingState />}
      {m && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Side title={t("patients.merges.surviving")} side={m.surviving} />
            <Side title={t("patients.merges.merged")} side={m.merged} />
          </div>
          {m.preview && (
            <dl className="m-0 grid grid-cols-2 gap-1 text-body-sm">
              {(
                [
                  "identifiers",
                  "insurance_profiles",
                  "health_items",
                  "account_links",
                  "other_facilities",
                ] as const
              ).map((k) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{t(`patients.merges.preview.${k}`)}</dt>
                  <dd className="m-0">{m.preview![k]}</dd>
                </div>
              ))}
            </dl>
          )}
          {m.preview && m.preview.conflicts.length > 0 && (
            <Alert tone="danger" role="alert">
              {t("patients.merges.conflicts", { kinds: m.preview.conflicts.join(", ") })}
            </Alert>
          )}
          <p className="m-0">
            <span className="text-body-sm text-fg-muted">{t("patients.merges.reason")}: </span>
            {m.reason} · {m.requested_by}
          </p>
          {m.decision_reason && <p className="m-0 text-body-sm">{m.decision_reason}</p>}
          <div className="flex flex-wrap gap-2">
            {open && canApprove && !isRequester && (
              <>
                <Button onClick={() => setAction("approve")}>{t("patients.merges.approve")}</Button>
                <Button variant="secondary" onClick={() => setAction("reject")}>
                  {t("patients.merges.reject")}
                </Button>
              </>
            )}
            {open && isRequester && !platform && (
              <>
                <Button variant="secondary" onClick={() => setAction("cancel")}>
                  {t("patients.merges.cancel")}
                </Button>
                {m.scope === "facility" && !m.is_escalated && (
                  <Button variant="ghost" onClick={() => setAction("escalate")}>
                    {t("patients.merges.escalate")}
                  </Button>
                )}
              </>
            )}
            {m.status === "executed" && canApprove && (platform || m.scope === "facility") && (
              <Button variant="danger" onClick={() => setAction("undo")}>
                {t("patients.merges.undo")}
              </Button>
            )}
          </div>
          {action && (
            <ConfirmDialog
              open
              onOpenChange={(o) => !o && setAction(null)}
              title={t(`patients.merges.confirm.${action}.title`)}
              consequences={t(`patients.merges.confirm.${action}.consequences`)}
              confirmLabel={t(`patients.merges.${action}`)}
              cancelLabel={t("patients.cancel")}
              closeLabel={t("patients.close")}
              tone={action === "approve" || action === "escalate" ? "primary" : "danger"}
              reasonLabel={
                ["reject", "undo", "approve"].includes(action)
                  ? t("patients.merges.reason")
                  : undefined
              }
              reasonRequired={action === "reject" || action === "undo"}
              reasonRequiredMessage={t("patients.required")}
              busy={run.isPending}
              error={run.isError ? actionError(run.error, t("errors.generic")) : undefined}
              onConfirm={(reason) => run.mutate({ act: action, reason, m })}
            />
          )}
        </div>
      )}
    </SidePanel>
  );
}
