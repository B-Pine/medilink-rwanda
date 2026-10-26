import {
  hasPermission,
  isApiError,
  type MediLinkApi,
  type TicketAction,
  type TicketActionInput,
  type TicketRow,
} from "@medilink/api-client";
import { QueueFlagChip, type QueueFlag } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { liveStore, queueKeys } from "./live";

export function useCan(...codes: string[]): boolean {
  const { data: me } = useStaffMe();
  return codes.some((code) => hasPermission(me, code));
}

/** Service names by id, in the UI language (from the S2 catalogue). */
export function useServiceNames(): (id: string) => string {
  const api = useApi();
  const { i18n, t } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? "en") as "rw" | "en" | "fr";
  const services = useQuery({
    queryKey: ["setup", "services"],
    queryFn: () => api.setup.services(),
  });
  return (id: string) => {
    const names = services.data?.results.find((s) => s.id === id)?.name_i18n;
    return names?.[lang] || names?.en || t("queue.unknownService");
  };
}

/** Minutes since an ISO time, for "waiting 12 min". */
export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
}

export function Flags({ ticket }: { ticket: TicketRow }) {
  const { t } = useTranslation();
  if (!ticket.flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ticket.flags.map((flag) => {
        const [kind, detail] = flag.split(":") as [QueueFlag, string | undefined];
        return (
          <QueueFlagChip key={flag} flag={kind}>
            {detail ? t(`queue.priority.${detail}`) : t(`queue.flags.${kind}`)}
          </QueueFlagChip>
        );
      })}
    </span>
  );
}

// ---- actions, with a retry queue while offline (FR-QUE-16) -----------------------------------------

interface Pending {
  ticketId: string;
  action: TicketAction;
  body: TicketActionInput;
}

const pending: Pending[] = [];
let flushing = false;

async function flush(api: MediLinkApi, done: () => void) {
  if (flushing) return;
  flushing = true;
  try {
    while (pending.length && navigator.onLine) {
      const next = pending[0]!;
      try {
        await api.queue.act(next.ticketId, next.action, next.body);
      } catch (error) {
        if (!isApiError(error)) break; // still offline: keep it
      }
      pending.shift();
      liveStore.setPending(pending.length);
    }
  } finally {
    flushing = false;
    done();
  }
}

const isNetworkError = (error: unknown) => !isApiError(error) && !navigator.onLine;

export function useTicketAction() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queueKeys.all });
  return useMutation({
    mutationFn: async (vars: {
      ticket: TicketRow;
      action: TicketAction;
      body?: Omit<TicketActionInput, "version">;
    }) => {
      const body = { ...vars.body, version: vars.ticket.version };
      try {
        return await api.queue.act(vars.ticket.id, vars.action, body);
      } catch (error) {
        if (isNetworkError(error)) {
          pending.push({
            ticketId: vars.ticket.id,
            action: vars.action,
            body: { ...body, client_occurred_at: new Date().toISOString() },
          });
          liveStore.setPending(pending.length);
          window.addEventListener("online", () => void flush(api, refresh), { once: true });
          return null;
        }
        throw error;
      }
    },
    onSettled: refresh,
  });
}

export function actionError(error: unknown, fallback: string): string | null {
  if (!error) return null;
  if (isApiError(error)) {
    const fields = Object.values(error.fields).flat();
    return fields.length ? `${error.message} ${fields.join(" ")}` : error.message;
  }
  return fallback;
}
