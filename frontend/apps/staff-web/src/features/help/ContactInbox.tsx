import type { ContactMessageRow } from "@medilink/api-client";
import { CheckCircle, EnvelopeSimple, MagnifyingGlass, Phone, Tray } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  LoadingState,
  TextareaField,
  TextField,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { PlatformOnly } from "../platform/shared";
import { errorText, helpKeys, useWhen } from "./shared";

const TABS = ["new", "handled", "all"] as const;
type Tab = (typeof TABS)[number];

const isEmail = (reach: string) => reach.includes("@");

/**
 * /platform/contact-messages: what visitors sent from the public Contact page (upgrade 11 §13).
 * The team answers on the visitor's own email or phone, then marks the message handled.
 */
export function ContactInboxPage() {
  return (
    <PlatformOnly>
      <Inbox />
    </PlatformOnly>
  );
}

function Inbox() {
  const { t } = useTranslation();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as Tab)
    : "new";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const list = useQuery({
    queryKey: [...helpKeys.all, "contact", tab, q],
    queryFn: () =>
      api.help.platform.contactMessages({
        status: tab === "all" ? undefined : tab,
        q: q.length >= 2 ? q : undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader title={t("help.contact.title")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label={t("help.contact.tabs.label")} className="flex gap-2">
          {TABS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={tab === s}
              onClick={() => set({ status: s === "new" ? "" : s })}
              className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {t(`help.contact.tabs.${s}`)}
            </button>
          ))}
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: search.trim() });
          }}
          className="flex items-end gap-2"
        >
          <TextField
            label={t("help.contact.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="secondary" aria-label={t("help.contact.searchGo")}>
            <MagnifyingGlass aria-hidden="true" />
          </Button>
        </form>
      </div>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <Alert tone="danger" role="alert" title={errorText(list.error, t("help.loadFailed"))}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("help.retry")}
          </Button>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tray}
          title={tab === "new" ? t("help.contact.emptyNew") : t("help.contact.empty")}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageCard({ message: m }: { message: ContactMessageRow }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const handle = useMutation({
    mutationFn: () => api.help.platform.handleContact(m.id, note.trim()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...helpKeys.all, "contact"] }),
  });
  const email = isEmail(m.reach);
  const answer = email
    ? `mailto:${m.reach}?subject=${encodeURIComponent(`Re: ${m.subject} (${m.reference})`)}`
    : `tel:${m.reach.replace(/\s/g, "")}`;

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 font-heading text-h3 break-words">{m.subject}</h2>
          <p className="m-0 text-body-sm text-fg-secondary">
            <span className="font-semibold text-fg">{m.name}</span>
            {" · "}
            <span className="font-mono">{m.reference}</span>
            {" · "}
            {when(m.created_at)}
          </p>
        </div>
        {m.status === "handled" ? (
          <Badge tone="success" icon={CheckCircle}>
            {t("help.contact.handled")}
          </Badge>
        ) : (
          <Badge tone="info">{t("help.contact.new")}</Badge>
        )}
      </div>
      <p className="m-0 whitespace-pre-line text-fg">{m.message}</p>
      {m.status === "handled" ? (
        <p className="m-0 rounded-xl bg-subtle p-3 text-body-sm text-fg-secondary">
          {t("help.contact.handledBy", {
            name: m.handled_by?.full_name ?? "",
            when: m.handled_at ? when(m.handled_at) : "",
          })}
          {m.note && <span className="mt-1 block text-fg">{m.note}</span>}
        </p>
      ) : closing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handle.mutate();
          }}
          className="flex flex-col gap-3 border-t border-border/60 pt-3"
        >
          <TextareaField
            label={t("help.contact.note")}
            hint={t("help.contact.noteHint")}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            optional
          />
          {handle.isError && (
            <Alert tone="danger" role="alert">
              {errorText(handle.error, t("help.loadFailed"))}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={handle.isPending}>
              {t("help.contact.markHandled")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setClosing(false)}>
              {t("help.contact.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <a href={answer} className={buttonClassName({ variant: "secondary" })}>
            {email ? <EnvelopeSimple aria-hidden="true" /> : <Phone aria-hidden="true" />}
            {email
              ? t("help.contact.replyEmail", { reach: m.reach })
              : t("help.contact.call", { reach: m.reach })}
          </a>
          <Button variant="ghost" onClick={() => setClosing(true)}>
            <CheckCircle aria-hidden="true" />
            {t("help.contact.markHandled")}
          </Button>
        </div>
      )}
    </li>
  );
}
