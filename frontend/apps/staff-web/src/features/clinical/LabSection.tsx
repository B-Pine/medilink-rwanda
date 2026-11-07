import type { Consultation, LabOrder } from "@medilink/api-client";
import {
  Alert,
  Button,
  buttonClassName,
  CheckboxField,
  TextareaField,
  TextField,
} from "@medilink/ui";
import {
  ArrowRight,
  CheckCircle,
  MegaphoneSimple,
  PaperPlaneTilt,
  TestTube,
  XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { labKeys, LabResultTable, LabStateBadge, useLabTests } from "./LabShared";
import { errorText, useCan, useWhen } from "./shared";

const OPEN = new Set(["ordered", "sample_taken"]);

/**
 * Tests in the consultation (upgrade 06 §3, #201): the doctor orders tests and sends the patient
 * to the lab; the results come back here; the doctor reviews each one and releases it to the
 * patient. The consultation stays a draft while the patient is at the lab.
 */
export function LabSection({ consultation: c }: { consultation: Consultation }) {
  const { t } = useTranslation();
  const api = useApi();
  const canView = useCan("clinical.view");
  const orders = useQuery({
    queryKey: labKeys.orders(c.id),
    queryFn: () => api.clinical.lab.orders(c.id),
    enabled: canView,
    refetchInterval: 30_000,
  });
  const canOrder = c.can_edit && c.status === "draft";
  const rows = orders.data ?? [];
  if (!canView || c.status === "entered_in_error") return null;
  if (!canOrder && orders.isSuccess && rows.length === 0) return null;

  return (
    <section
      id="lab"
      tabIndex={-1}
      aria-labelledby="lab-title"
      className="flex scroll-mt-28 flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-on-brand-subtle"
        >
          <TestTube weight="bold" className="size-[1.125rem]" />
        </span>
        <h2 id="lab-title" className="m-0 font-heading text-h3 tracking-tight">
          {t("clinical.lab.title")}
        </h2>
      </div>
      {orders.isError && (
        <Alert tone="danger" role="alert">
          {errorText(orders.error, t("errors.generic"))}
        </Alert>
      )}
      {rows.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((order) => (
            <OrderRow key={order.id} order={order} consultationId={c.id} />
          ))}
        </ul>
      ) : (
        orders.isSuccess && <p className="m-0 text-fg-muted">{t("clinical.lab.none")}</p>
      )}
      {canOrder && (
        <>
          <OrderForm consultationId={c.id} open={rows.filter((o) => OPEN.has(o.state))} />
          <SendToLab c={c} ordered={rows.some((o) => o.state === "ordered")} />
        </>
      )}
    </section>
  );
}

function OrderForm({ consultationId, open }: { consultationId: string; open: LabOrder[] }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const tests = useLabTests();
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const taken = new Set(open.map((o) => o.test_code));
  const order = useMutation({
    mutationFn: () =>
      api.clinical.lab.order(consultationId, { tests: picked, reason: reason.trim() }),
    onSuccess: (rows) => {
      queryClient.setQueryData(labKeys.orders(consultationId), rows);
      setPicked([]);
      setReason("");
      setTried(false);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (picked.length) order.mutate();
  };
  const toggle = (code: string, on: boolean) =>
    setPicked((now) => (on ? [...now, code] : now.filter((c) => c !== code)));

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="lab-order-title"
      className="flex flex-col gap-4 border-t border-border/60 pt-4"
    >
      <h3 id="lab-order-title" className="m-0 font-heading text-body font-bold">
        {t("clinical.lab.order")}
      </h3>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-body-sm font-semibold">{t("clinical.lab.choose")}</legend>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {(tests.data ?? []).map((test) => (
            <CheckboxField
              key={test.code}
              label={test.name}
              hint={t(`clinical.lab.specimens.${test.specimen}`)}
              checked={picked.includes(test.code)}
              disabled={taken.has(test.code)}
              onChange={(e) => toggle(test.code, e.target.checked)}
            />
          ))}
        </div>
        {tried && !picked.length && (
          <p role="alert" className="m-0 mt-2 text-body-sm font-semibold text-danger">
            {t("clinical.lab.chooseOne")}
          </p>
        )}
      </fieldset>
      <TextField
        label={t("clinical.lab.reason")}
        hint={t("clinical.lab.reasonHint")}
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      {order.isError && (
        <Alert tone="danger" role="alert">
          {errorText(order.error, t("errors.generic"))}
        </Alert>
      )}
      <Button type="submit" variant="secondary" className="self-start" loading={order.isPending}>
        {t("clinical.lab.submit")}
      </Button>
    </form>
  );
}

/** Send to lab: the doctor's patient in service goes to the lab and comes back with results. */
function SendToLab({ c, ordered }: { c: Consultation; ordered: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const canCall = useCan("queue.call");
  const [sent, setSent] = useState(false);
  const mine = useQuery({
    queryKey: ["queue", "mine"],
    queryFn: () => api.queue.mine(),
    enabled: canCall,
  });
  const ticket =
    mine.data?.current?.visit_id === c.visit_id && mine.data.current.state === "in_service"
      ? mine.data.current
      : null;
  const send = useMutation({
    mutationFn: () => api.queue.act(ticket!.id, "send-to-lab", { version: ticket!.version }),
    onSuccess: () => {
      setSent(true);
      void queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
  if (sent)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-success-bg px-5 py-4">
        <CheckCircle aria-hidden="true" weight="fill" className="size-7 text-success" />
        <p role="status" className="m-0 min-w-0 flex-1">
          {t("clinical.lab.sent", { name: c.patient.display_name })}
        </p>
        <Link to="/queue/mine" className={buttonClassName({ pill: true })}>
          <MegaphoneSimple aria-hidden="true" weight="bold" />
          {t("clinical.sign.backToQueue")}
        </Link>
      </div>
    );
  if (!ticket || !ordered) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <p className="m-0 text-body-sm text-fg-secondary">{t("clinical.lab.sendHint")}</p>
      {send.isError && (
        <Alert tone="danger" role="alert">
          {errorText(send.error, t("errors.generic"))}
        </Alert>
      )}
      <Button pill className="self-start" loading={send.isPending} onClick={() => send.mutate()}>
        <PaperPlaneTilt aria-hidden="true" weight="bold" />
        {t("clinical.lab.send")}
        <ArrowRight aria-hidden="true" weight="bold" />
      </Button>
    </div>
  );
}

function OrderRow({ order, consultationId }: { order: LabOrder; consultationId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const { data: me } = useStaffMe();
  const canWrite = useCan("clinical.write");
  const [note, setNote] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: labKeys.orders(consultationId) });
    void queryClient.invalidateQueries({ queryKey: labKeys.inbox });
  };
  const step = useMutation({
    mutationFn: (kind: "review" | "release" | "cancel") =>
      kind === "review"
        ? api.clinical.lab.review(order, note.trim())
        : kind === "release"
          ? api.clinical.lab.release(order)
          : api.clinical.lab.cancel(order),
    onSuccess: refresh,
  });
  const mineOrder = me?.full_name === order.ordered_by_name;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{order.test_name}</span>
          <span className="text-caption text-fg-muted">
            {[
              order.specimen ? t(`clinical.lab.specimens.${order.specimen}`) : null,
              t("clinical.lab.orderedBy", {
                name: order.ordered_by_name ?? "—",
                time: when.time(order.ordered_at),
              }),
              order.resulted_at
                ? t("clinical.lab.resultedBy", {
                    name: order.resulted_by_name ?? "—",
                    time: when.time(order.resulted_at),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <LabStateBadge state={order.state} />
      </div>
      {order.reason && (
        <p className="m-0 text-body-sm text-fg-secondary">
          <span className="font-semibold">{t("clinical.lab.reasonShort")}</span> {order.reason}
        </p>
      )}
      <LabResultTable order={order} />
      {order.review_note && (
        <p className="m-0 rounded-xl bg-subtle/60 px-4 py-3 text-body-sm">
          <span className="font-semibold">{t("clinical.lab.note")}</span> {order.review_note}
        </p>
      )}
      {canWrite && order.state === "resulted" && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
          <TextareaField
            label={t("clinical.lab.note")}
            hint={t("clinical.lab.noteHint")}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            pill
            loading={step.isPending}
            onClick={() => step.mutate("review")}
            aria-label={`${t("clinical.lab.review")}: ${order.test_name}`}
          >
            <CheckCircle aria-hidden="true" weight="bold" />
            {t("clinical.lab.review")}
          </Button>
        </div>
      )}
      {canWrite && order.state === "reviewed" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          <p className="m-0 min-w-0 flex-1 text-body-sm text-fg-secondary">
            {t("clinical.lab.releaseHint")}
          </p>
          <Button
            pill
            loading={step.isPending}
            onClick={() => step.mutate("release")}
            aria-label={`${t("clinical.lab.release")}: ${order.test_name}`}
          >
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            {t("clinical.lab.release")}
          </Button>
        </div>
      )}
      {canWrite && mineOrder && order.state === "ordered" && (
        <Button
          variant="ghost"
          className="self-start"
          loading={step.isPending}
          onClick={() => step.mutate("cancel")}
          aria-label={`${t("clinical.lab.cancel")}: ${order.test_name}`}
        >
          <XCircle aria-hidden="true" />
          {t("clinical.lab.cancel")}
        </Button>
      )}
      {step.isError && (
        <Alert tone="danger" role="alert">
          {errorText(step.error, t("errors.generic"))}
        </Alert>
      )}
    </li>
  );
}
