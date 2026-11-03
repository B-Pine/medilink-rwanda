import { isApiError, type AppNotification } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  cx,
  EmptyState,
  formatKigaliTime,
  Skeleton,
} from "@medilink/ui";
import { formatDate, kigaliDate } from "@medilink/ui/i18n";
import {
  ArrowRight,
  BellSimple,
  CalendarCheck,
  CaretRight,
  Checks,
  Files,
  FileText,
  GearSix,
  Pill,
  ShieldCheck,
  Ticket,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { useOnline } from "../../layout/PatientShell";
import { PageHeader, panelClass, RowIcon, SegmentedTabs } from "../dashboard/kit";
import {
  notificationKeys,
  safeActionPath,
  useDependentNames,
  useMarkAllRead,
  useMarkRead,
  useUnreadCount,
} from "./api";
import { PushOffBanner, PushOptIn } from "./PushOptIn";

const PAGE_SIZE = 25;

function useWhen() {
  const { i18n } = useTranslation();
  return (iso: string) => formatKigaliTime(iso, i18n.resolvedLanguage ?? "rw");
}

function AboutChip({ patientId }: { patientId: string | null }) {
  const { t } = useTranslation();
  const name = useDependentNames()(patientId);
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-3 py-0.5 text-body-sm font-semibold text-info">
      <UserCircle aria-hidden="true" className="size-4" />
      {t("notifications.inbox.about", { name })}
    </span>
  );
}

/** An icon per kind of event, so the feed can be scanned by shape. */
function eventIcon(eventType: string): Icon {
  const type = eventType.toLowerCase();
  if (/(booking|appointment)/.test(type)) return CalendarCheck;
  if (/(queue|ticket|visit)/.test(type)) return Ticket;
  if (/(prescription|pharmacy|medic)/.test(type)) return Pill;
  if (/document/.test(type)) return Files;
  if (/(record|clinical|lab|result|summary)/.test(type)) return FileText;
  if (/(security|sign.?in|login|password|mfa)/.test(type)) return ShieldCheck;
  return BellSimple;
}

function Row({ item }: { item: AppNotification }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <li className="relative">
      {!item.is_read && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full bg-brand"
        />
      )}
      <Link
        to={paths.notification(item.id)}
        className="group flex items-start gap-4 px-4 py-4 text-fg no-underline transition-colors duration-150 hover:bg-subtle/70 sm:px-5"
      >
        <RowIcon icon={eventIcon(item.event_type)} tone={item.is_read ? "neutral" : "brand"} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cx("text-body", item.is_read ? "font-semibold" : "font-bold")}>
              {item.title}
            </span>
            {!item.is_read && <Badge tone="brand">{t("notifications.inbox.new")}</Badge>}
            {item.priority !== "routine" && (
              <Badge tone={item.priority === "critical" ? "danger" : "warning"}>
                {t(`notifications.priority.${item.priority}`)}
              </Badge>
            )}
            {item.is_withdrawn && <Badge>{t("notifications.inbox.withdrawn")}</Badge>}
          </span>
          <span className="line-clamp-2 text-body-sm text-fg-secondary">{item.body}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
            <time dateTime={item.created_at}>{when(item.created_at)}</time>
            {item.facility && <span>· {item.facility.name}</span>}
            <AboutChip patientId={item.patient_id} />
          </span>
        </span>
        <CaretRight
          aria-hidden="true"
          className="mt-2.5 size-5 shrink-0 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}

function States({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending)
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("notifications.loading")}
        className="flex flex-col gap-3"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="5rem" className="rounded-2xl" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <Alert tone="danger" role="alert" title={t("notifications.loadError")}>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </Alert>
    );
  return <>{children}</>;
}

/** "Today", "Yesterday" or the date, in Kigali time. */
function useDayLabel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const [today] = useState(() => kigaliDate());
  const [yesterday] = useState(() => kigaliDate(new Date(Date.now() - 86_400_000)));
  return (iso: string) => {
    const day = kigaliDate(new Date(iso));
    if (day === today) return t("notifications.inbox.today");
    if (day === yesterday) return t("notifications.inbox.yesterday");
    return formatDate(iso, lang, { weekday: "long", day: "numeric", month: "long" });
  };
}

type Filter = "all" | "unread";

/**
 * /notifications (design 07 §2, contract §6.2, redesign 2026-11-02): All / Unread, the feed in one
 * card under a heading per day, Mark all as read and Settings in the header, push-off banner.
 */
export function InboxPage() {
  const { t } = useTranslation();
  const api = useApi();
  const online = useOnline();
  const dayLabel = useDayLabel();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const params = { page, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => api.notifications.patient.list(params),
  });
  const count = useUnreadCount();
  const markAll = useMarkAllRead();
  const unread = count.data?.unread ?? 0;
  const all = list.data?.results ?? [];
  const rows = filter === "unread" ? all.filter((item) => !item.is_read) : all;
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));
  const days: { label: string; rows: AppNotification[] }[] = [];
  for (const item of rows) {
    const label = dayLabel(item.created_at);
    const day = days.find((d) => d.label === label);
    if (day) day.rows.push(item);
    else days.push({ label, rows: [item] });
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("notifications.inbox.title")}
        subtitle={t("notifications.inbox.unreadSummary", { count: unread })}
        actions={
          <>
            <Link
              to={paths.notificationSettings}
              className={buttonClassName({ variant: "secondary" })}
            >
              <GearSix aria-hidden="true" className="size-4" />
              {t("notifications.settings.link")}
            </Link>
            {all.length > 0 && (
              <Button
                disabled={unread === 0}
                loading={markAll.isPending}
                iconStart={<Checks aria-hidden="true" className="size-4" />}
                onClick={() => markAll.mutate(all[0]?.created_at)}
              >
                {t("notifications.inbox.markAll")}
              </Button>
            )}
          </>
        }
      />
      {!online && (
        <Alert tone="warning" role="status">
          {t("notifications.offline")}
        </Alert>
      )}
      <PushOffBanner />
      <States query={list}>
        {all.length === 0 ? (
          <EmptyState
            icon={BellSimple}
            title={t("notifications.inbox.empty")}
            description={t("notifications.inbox.emptyBody")}
            action={<PushOptIn compact />}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <SegmentedTabs
              label={t("notifications.inbox.which")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("notifications.inbox.all") },
                {
                  value: "unread",
                  label: t("notifications.inbox.unread"),
                  count: unread || undefined,
                },
              ]}
            />
            {rows.length === 0 ? (
              <div
                className={cx(
                  panelClass,
                  "flex flex-col items-center gap-2 px-5 py-10 text-center",
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-12 place-items-center rounded-full bg-success-bg text-success"
                >
                  <Checks weight="bold" className="size-6" />
                </span>
                <p className="m-0 font-semibold text-fg">{t("notifications.inbox.caughtUp")}</p>
              </div>
            ) : (
              <ul
                className={cx(panelClass, "m-0 flex list-none flex-col overflow-hidden p-0")}
                aria-label={t("notifications.inbox.title")}
              >
                {days.map((day) => (
                  <li key={day.label} className="border-b border-border last:border-b-0">
                    <p className="m-0 border-b border-border bg-subtle/60 px-4 py-2 text-caption font-semibold tracking-wide text-fg-secondary uppercase first-letter:uppercase sm:px-5">
                      {day.label}
                    </p>
                    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                      {day.rows.map((item) => (
                        <Row key={item.id} item={item} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </States>
      {pages > 1 && (
        <nav
          aria-label={t("notifications.inbox.pages")}
          className="flex items-center justify-between gap-3"
        >
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t("notifications.inbox.previous")}
          </Button>
          <span className="text-body-sm text-fg-secondary tabular-nums">
            {t("notifications.inbox.page", { page, pages })}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t("notifications.inbox.next")}
          </Button>
        </nav>
      )}
    </div>
  );
}

/** /notifications/:id: the push click target; opening it marks it read. */
export function NotificationDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const { id = "" } = useParams();
  const item = useQuery({
    queryKey: notificationKeys.detail(id),
    queryFn: () => api.notifications.patient.get(id),
  });
  const { mutate } = useMarkRead();
  const unread = item.data && !item.data.is_read;
  useEffect(() => {
    if (unread) mutate(id);
  }, [unread, id, mutate]);
  const data = item.data;
  const notFound = item.isError && isApiError(item.error) && item.error.status === 404;
  const path = safeActionPath(data?.action_path);
  const title = data?.title ?? t("notifications.inbox.title");
  const back = { to: paths.notifications, label: t("notifications.inbox.back") };
  if (notFound)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("notifications.detail.notFound")}
          subtitle={t("notifications.detail.notFoundBody")}
          back={back}
        />
      </div>
    );
  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      <PageHeader title={title} back={back} />
      <States query={item}>
        {data && (
          <article className={cx(panelClass, "flex flex-col overflow-hidden")}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
              <RowIcon icon={eventIcon(data.event_type)} />
              <span className="flex min-w-0 flex-1 flex-col">
                {data.facility && (
                  <span className="text-body-sm font-semibold text-fg">{data.facility.name}</span>
                )}
                <time dateTime={data.created_at} className="text-caption text-fg-muted">
                  {when(data.created_at)}
                </time>
              </span>
              {data.is_withdrawn && <Badge>{t("notifications.inbox.withdrawn")}</Badge>}
              <AboutChip patientId={data.patient_id} />
            </div>
            <p className="m-0 p-5 text-body whitespace-pre-line text-fg">{data.body}</p>
            {path && path !== paths.notification(data.id) && (
              <div className="border-t border-border bg-subtle/60 px-5 py-3">
                <Link to={path} className={buttonClassName({})}>
                  {t("notifications.detail.open")}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            )}
          </article>
        )}
      </States>
    </div>
  );
}
