import type { QueueGroup, TicketRow } from "@medilink/api-client";
import { Alert, Badge, Button, TicketNumber } from "@medilink/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { queueKeys } from "./live";
import { actionError, useCan, useServiceNames } from "./shared";

/** Remote joiners reception has not confirmed yet ("I'm here" first, then by place in line). */
export function unconfirmedRemote(queues: QueueGroup[], serviceId: string | null): TicketRow[] {
  return queues
    .filter((q) => !serviceId || q.service_id === serviceId)
    .flatMap((q) => q.waiting)
    .filter((t) => t.flags.includes("remote") || t.flags.includes("remote_claimed"))
    .sort(
      (a, b) =>
        Number(b.flags.includes("remote_claimed")) - Number(a.flags.includes("remote_claimed")) ||
        (a.position ?? 0) - (b.position ?? 0),
    );
}

/** Reception confirms a remote patient is on site (decision 2026-10-31: "I'm here" is intent). */
export function useConfirmArrival() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticket: TicketRow) => api.queue.confirmArrival(ticket),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queueKeys.all }),
  });
}

/**
 * "Remote joiners not arrived" under Expected (design 04 §3.1, contract S5 §2.2): patients who
 * joined from home. A patient who tapped "I'm here" is marked and listed first; Confirm arrival
 * stops the pass-over moves for that ticket. Hidden when there is none.
 */
export function RemoteList({
  queues,
  serviceId,
}: {
  queues: QueueGroup[];
  serviceId: string | null;
}) {
  const { t } = useTranslation();
  const serviceName = useServiceNames();
  const canConfirm = useCan("queue.operate");
  const confirm = useConfirmArrival();
  const rows = unconfirmedRemote(queues, serviceId);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 id="remote-joiners" className="m-0 font-heading text-body font-semibold">
        {t("queue.board.remote", { count: rows.length })}
      </h3>
      <p className="m-0 text-body-sm text-fg-muted">{t("queue.board.remoteHint")}</p>
      {confirm.isError && (
        <Alert tone="danger" role="alert">
          {actionError(confirm.error, t("queue.board.remoteError"))}
        </Alert>
      )}
      <ul
        aria-labelledby="remote-joiners"
        className="m-0 flex list-none flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface p-0 shadow-card"
      >
        {rows.map((ticket) => (
          <li key={ticket.id} className="flex flex-col gap-2.5 px-3 py-3">
            <div className="flex items-start gap-3">
              <TicketNumber
                number={ticket.number}
                size="sm"
                stub
                tone={ticket.remote_arrival_claimed_at ? "attention" : "neutral"}
                className="shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold leading-6 break-words">{ticket.display_name}</span>
                <span className="text-body-sm text-fg-muted break-words">
                  {serviceName(ticket.service_id)} ·{" "}
                  {t("queue.panel.ahead", { count: ticket.position ?? 0 })}
                </span>
              </span>
              {ticket.remote_arrival_claimed_at && (
                <Badge tone="info" className="shrink-0">
                  {t("queue.board.remoteClaimed")}
                </Badge>
              )}
            </div>
            {canConfirm && (
              <Button
                size="sm"
                className="self-start"
                variant={ticket.remote_arrival_claimed_at ? "primary" : "secondary"}
                loading={confirm.isPending && confirm.variables?.id === ticket.id}
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(ticket)}
              >
                {t("queue.board.remoteConfirm")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
