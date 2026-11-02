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
import { BellSimple, Checks, GearSix, UserCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { useOnline } from "../../layout/PatientShell";
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

function Card({ item }: { item: AppNotification }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <li>
      <Link
        to={paths.notification(item.id)}
        className={cx(
          "flex min-h-target flex-col gap-2 rounded-lg border p-4 text-fg no-underline hover:border-brand",
          item.is_read ? "border-border bg-surface" : "border-brand bg-brand-subtle/40",
        )}
      >
        <span className="flex flex-wrap items-center gap-2">
          {!item.is_read && <Badge tone="brand">{t("notifications.inbox.new")}</Badge>}
          {item.priority !== "routine" && (
            <Badge tone={item.priority === "critical" ? "danger" : "warning"}>
              {t(`notifications.priority.${item.priority}`)}
            </Badge>
          )}
          {item.is_withdrawn && <Badge>{t("notifications.inbox.withdrawn")}</Badge>}
          <AboutChip patientId={item.patient_id} />
        </span>
        <span className={cx("text-body", item.is_read ? "font-semibold" : "font-bold")}>
          {item.title}
        </span>
        <span className="text-body text-fg-secondary">{item.body}</span>
        <span className="text-body-sm text-fg-muted">
          <time dateTime={item.created_at}>{when(item.created_at)}</time>
          {item.facility ? ` · ${item.facility.name}` : ""}
        </span>
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
          <Skeleton key={i} height="7rem" className="rounded-lg" />
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

/** /notifications (design 07 §2, contract §6.2): cards, Mark all as read, push-off banner. */
export function InboxPage() {
  const { t } = useTranslation();
  const api = useApi();
  const online = useOnline();
  const [page, setPage] = useState(1);
  const params = { page, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => api.notifications.patient.list(params),
  });
  const count = useUnreadCount();
  const markAll = useMarkAllRead();
  const unread = count.data?.unread ?? 0;
  const rows = list.data?.results ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title={t("notifications.inbox.title")}>
          {t("notifications.inbox.title")}
        </PageHeading>
        <Link to={paths.notificationSettings} className={buttonClassName({ variant: "ghost" })}>
          <GearSix aria-hidden="true" className="size-icon" />
          {t("notifications.settings.link")}
        </Link>
      </div>
      <p className="m-0 text-fg-secondary">
        {t("notifications.inbox.unreadSummary", { count: unread })}
      </p>
      {!online && (
        <Alert tone="warning" role="status">
          {t("notifications.offline")}
        </Alert>
      )}
      <PushOffBanner />
      <States query={list}>
        {rows.length === 0 ? (
          <EmptyState
            icon={BellSimple}
            title={t("notifications.inbox.empty")}
            description={t("notifications.inbox.emptyBody")}
            action={<PushOptIn compact />}
          />
        ) : (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="self-start"
              disabled={unread === 0}
              loading={markAll.isPending}
              iconStart={<Checks aria-hidden="true" className="size-icon" />}
              onClick={() => markAll.mutate(rows[0]?.created_at)}
            >
              {t("notifications.inbox.markAll")}
            </Button>
            <ul
              className="m-0 flex list-none flex-col gap-3 p-0"
              aria-label={t("notifications.inbox.title")}
            >
              {rows.map((item) => (
                <Card key={item.id} item={item} />
              ))}
            </ul>
          </>
        )}
      </States>
      {pages > 1 && (
        <nav
          aria-label={t("notifications.inbox.pages")}
          className="flex items-center justify-between gap-3"
        >
          <Button
            variant="secondary"
            size="lg"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("notifications.inbox.previous")}
          </Button>
          <span className="text-body-sm text-fg-secondary">
            {t("notifications.inbox.page", { page, pages })}
          </span>
          <Button
            variant="secondary"
            size="lg"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
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
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <Link to={paths.notifications} className="self-start font-semibold text-link">
        {t("notifications.inbox.back")}
      </Link>
      {notFound ? (
        <>
          <PageHeading title={t("notifications.detail.notFound")}>
            {t("notifications.detail.notFound")}
          </PageHeading>
          <p className="m-0 text-fg-secondary">{t("notifications.detail.notFoundBody")}</p>
        </>
      ) : (
        <States query={item}>
          {data && (
            <article className="flex flex-col gap-3">
              <span className="flex flex-wrap items-center gap-2">
                {data.is_withdrawn && <Badge>{t("notifications.inbox.withdrawn")}</Badge>}
                <AboutChip patientId={data.patient_id} />
              </span>
              <PageHeading title={title}>{title}</PageHeading>
              <p className="m-0 text-body-sm text-fg-muted">
                <time dateTime={data.created_at}>{when(data.created_at)}</time>
                {data.facility ? ` · ${data.facility.name}` : ""}
              </p>
              <p className="m-0 whitespace-pre-line text-body text-fg">{data.body}</p>
              {path && path !== paths.notification(data.id) && (
                <Link to={path} className={cx(buttonClassName({ size: "lg" }), "self-start")}>
                  {t("notifications.detail.open")}
                </Link>
              )}
            </article>
          )}
        </States>
      )}
    </div>
  );
}
