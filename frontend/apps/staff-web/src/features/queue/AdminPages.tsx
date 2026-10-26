import { Alert, Badge, Button, CheckboxField, Dialog, EmptyState, TextField } from "@medilink/ui";
import { ArrowsDownUp, Copy, Monitor, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { queueKeys } from "./live";
import { actionError, useCan, useServiceNames } from "./shared";

/** /queue/reorders (FR-QUE-10): every manual reorder, with who, why, and a review mark. */
export function ReordersPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const allowed = useCan("facility.configure");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const rows = useQuery({
    queryKey: [...queueKeys.reorders, onlyOpen],
    queryFn: () => api.queue.reorders(onlyOpen ? false : undefined),
    enabled: allowed,
  });
  const review = useMutation({
    mutationFn: (eventId: string) => api.queue.review(eventId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queueKeys.reorders }),
  });
  if (!allowed) return <NotFoundContent />;
  const list = rows.data?.results ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("queue.reorders.title")} description={t("queue.reorders.intro")} />
      <CheckboxField
        label={t("queue.reorders.onlyOpen")}
        checked={onlyOpen}
        onChange={(e) => setOnlyOpen(e.target.checked)}
      />
      {rows.data && list.length === 0 ? (
        <EmptyState
          icon={ArrowsDownUp}
          title={t("queue.reorders.emptyTitle")}
          description={t("queue.reorders.empty")}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t("queue.reorders.title")}</caption>
            <thead className="bg-subtle text-body-sm text-fg-secondary">
              <tr>
                {["when", "ticket", "who", "reason", "move", "review"].map((c) => (
                  <th key={c} scope="col" className="px-4 py-2.5 font-semibold">
                    {t(`queue.reorders.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.event_id} className="border-t border-border">
                  <td className="px-4 py-3 text-body-sm tabular-nums">
                    {new Date(r.occurred_at).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 font-heading font-bold tabular-nums">
                    {r.ticket_number}
                  </td>
                  <td className="px-4 py-3">{r.actor_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {t(`queue.reasons.${r.reason_code}`, { defaultValue: r.reason_code })}
                    {r.reason_text && (
                      <span className="block text-body-sm text-fg-secondary">{r.reason_text}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t("queue.reorders.positions", {
                      from: Number(r.old_position ?? 0) + 1,
                      to: Number(r.new_position ?? 0) + 1,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {r.reviewed ? (
                      <Badge tone="success">{t("queue.reorders.reviewed")}</Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => review.mutate(r.event_id)}
                        aria-label={`${t("queue.reorders.markReviewed")}: ${r.ticket_number}`}
                      >
                        {t("queue.reorders.markReviewed")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /settings/displays: waiting-room screen links; the token is shown once (contract §3.1 Q9). */
export function DisplaysPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const allowed = useCan("facility.configure");
  const links = useQuery({
    queryKey: queueKeys.displays,
    queryFn: () => api.queue.displayLinks(),
    enabled: allowed,
  });
  const [creating, setCreating] = useState(false);
  const revoke = useMutation({
    mutationFn: (id: string) => api.queue.revokeDisplayLink(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queueKeys.displays }),
  });
  if (!allowed) return <NotFoundContent />;
  const list = links.data?.results ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("queue.displays.title")}
        description={t("queue.displays.intro")}
        back={{ to: "/settings", label: t("setup.settings.title") }}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" weight="bold" />
            {t("queue.displays.add")}
          </Button>
        }
      />
      {links.data && list.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title={t("queue.displays.emptyTitle")}
          description={t("queue.displays.empty")}
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {list.map((link) => (
            <li
              key={link.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-md bg-forest text-on-forest-accent">
                    <Monitor aria-hidden="true" weight="duotone" className="size-5" />
                  </span>
                  <div>
                    <h2 className="m-0 font-heading text-h3">{link.label}</h2>
                    <p className="m-0 text-body-sm text-fg-secondary">
                      {link.service_ids.map(serviceName).join(", ")}
                    </p>
                  </div>
                </div>
                <Badge tone={link.revoked_at ? "neutral" : "success"}>
                  {link.revoked_at ? t("queue.displays.revoked") : t("queue.displays.active")}
                </Badge>
              </div>
              <p className="m-0 text-body-sm text-fg-secondary">
                {link.last_seen_at
                  ? t("queue.displays.lastSeen", {
                      time: new Date(link.last_seen_at).toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    })
                  : t("queue.displays.neverSeen")}
              </p>
              {!link.revoked_at && (
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => revoke.mutate(link.id)}
                >
                  {t("queue.displays.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateDisplay onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateDisplay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const services = useQuery({
    queryKey: ["setup", "services"],
    queryFn: () => api.setup.services(),
  });
  const [label, setLabel] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => api.queue.createDisplayLink({ label, service_ids: chosen }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queueKeys.displays }),
  });
  const url = create.data ? `${window.location.origin}/display/${create.data.token}` : "";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={create.data ? t("queue.displays.created") : t("queue.displays.add")}
      description={create.data ? t("queue.displays.onceHint") : undefined}
      closeLabel={t("queue.close")}
      footer={
        create.data ? (
          <Button onClick={onClose}>{t("queue.displays.done")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("queue.cancel")}
            </Button>
            <Button
              disabled={!label.trim() || chosen.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("queue.displays.create")}
            </Button>
          </>
        )
      }
    >
      {create.data ? (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-md bg-qr-bg p-3">
            <QRCodeSVG
              value={url}
              size={176}
              bgColor="transparent"
              fgColor="currentColor"
              className="text-qr-fg"
            />
          </div>
          <code className="w-full rounded-md bg-subtle px-3 py-2 text-caption break-all">
            {url}
          </code>
          <Button
            variant="secondary"
            onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          >
            <Copy aria-hidden="true" />
            {copied ? t("queue.displays.copied") : t("queue.displays.copy")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TextField
            label={t("queue.displays.label")}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 font-semibold">{t("queue.displays.services")}</legend>
            {(services.data?.results ?? [])
              .filter((s) => s.is_active)
              .map((s) => (
                <CheckboxField
                  key={s.id}
                  label={serviceName(s.id)}
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id),
                    )
                  }
                />
              ))}
          </fieldset>
          {create.isError && (
            <Alert tone="danger" role="alert">
              {actionError(create.error, t("queue.failed"))}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}
