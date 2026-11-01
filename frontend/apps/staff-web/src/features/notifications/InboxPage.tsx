import type { AppNotification } from "@medilink/api-client";
import {
  Badge,
  Button,
  buttonClassName,
  cx,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@medilink/ui";
import { ArrowSquareOut, BellSimple, Check, Checks, GearSix } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { notificationKeys, safeActionPath } from "./live";
import { useMarkAllRead, useMarkRead, useUnreadCount } from "./NotificationBell";
import { ListSkeleton, LoadError, OfflineNotice, useFormatWhen } from "./shared";

const PAGE_SIZE = 25;

function PriorityBadge({ item }: { item: AppNotification }) {
  const { t } = useTranslation();
  if (item.priority === "routine") return null;
  return (
    <Badge tone={item.priority === "critical" ? "danger" : "warning"}>
      {t(`notifications.priority.${item.priority}`)}
    </Badge>
  );
}

function NotificationRow({ item }: { item: AppNotification }) {
  const { t } = useTranslation();
  const when = useFormatWhen();
  const markRead = useMarkRead();
  const path = safeActionPath(item.action_path);
  const detail = `/notifications/${item.id}`;
  return (
    <li
      className={cx(
        "flex flex-col gap-2 rounded-lg border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between",
        item.is_read ? "border-border" : "border-primary/40 bg-brand-subtle/30",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {!item.is_read && <Badge tone="brand">{t("notifications.inbox.unreadBadge")}</Badge>}
          <PriorityBadge item={item} />
          {item.is_withdrawn && <Badge tone="neutral">{t("notifications.inbox.withdrawn")}</Badge>}
        </div>
        <h2
          className={cx(
            "m-0 text-body",
            item.is_read ? "font-semibold text-fg-secondary" : "font-bold text-fg",
          )}
        >
          <Link to={detail} className="text-inherit no-underline hover:underline">
            {item.title}
          </Link>
        </h2>
        <p className="m-0 text-fg-secondary">{item.body}</p>
        <p className="m-0 text-body-sm text-fg-muted">
          <time dateTime={item.created_at}>{when(item.created_at)}</time>
          {item.facility ? ` · ${item.facility.name}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {!item.is_read && (
          <Button
            variant="secondary"
            loading={markRead.isPending}
            onClick={() => markRead.mutate(item.id)}
            iconStart={<Check aria-hidden="true" className="size-4" />}
            aria-label={t("notifications.inbox.markReadOne", { title: item.title })}
          >
            {t("notifications.inbox.markRead")}
          </Button>
        )}
        {path && path !== detail && (
          <Link
            to={path}
            className={buttonClassName({ variant: "ghost" })}
            onClick={() => !item.is_read && markRead.mutate(item.id)}
          >
            <ArrowSquareOut aria-hidden="true" className="size-4" />
            {t("notifications.inbox.open")}
          </Link>
        )}
      </div>
    </li>
  );
}

/** /notifications (contract §6.1): All / Unread, pages of 25, mark read, open `action_path`. */
export function InboxPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const params = { is_read: tab === "unread" ? false : undefined, page, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => api.notifications.staff.list(params),
  });
  const count = useUnreadCount();
  const markAll = useMarkAllRead();
  const unread = count.data?.unread ?? 0;
  const rows = list.data?.results ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("notifications.inbox.title")}
        description={t("notifications.inbox.unreadSummary", { count: unread })}
        actions={
          <>
            <Link to="/notifications/settings" className={buttonClassName({ variant: "ghost" })}>
              <GearSix aria-hidden="true" className="size-icon" />
              {t("notifications.settings.link")}
            </Link>
            <Button
              variant="secondary"
              disabled={unread === 0}
              loading={markAll.isPending}
              iconStart={<Checks aria-hidden="true" className="size-icon" />}
              onClick={() => markAll.mutate(undefined)}
            >
              {t("notifications.bell.markAll")}
            </Button>
          </>
        }
      />
      <OfflineNotice />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as "all" | "unread");
          setPage(1);
        }}
      >
        <TabsList aria-label={t("notifications.inbox.filter")}>
          <TabsTrigger value="all">{t("notifications.inbox.all")}</TabsTrigger>
          <TabsTrigger value="unread">
            {t("notifications.inbox.unreadTab", { count: unread })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="pt-4">
          {list.isPending ? (
            <ListSkeleton label={t("notifications.loading")} />
          ) : list.isError ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BellSimple}
              title={
                tab === "unread"
                  ? t("notifications.inbox.emptyUnread")
                  : t("notifications.inbox.empty")
              }
              description={t("notifications.inbox.emptyBody")}
            />
          ) : (
            <ul
              className="m-0 flex list-none flex-col gap-3 p-0"
              aria-label={t("notifications.inbox.title")}
            >
              {rows.map((item) => (
                <NotificationRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="unread" className="pt-4">
          {list.isPending ? (
            <ListSkeleton label={t("notifications.loading")} />
          ) : list.isError ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BellSimple}
              title={
                tab === "unread"
                  ? t("notifications.inbox.emptyUnread")
                  : t("notifications.inbox.empty")
              }
              description={t("notifications.inbox.emptyBody")}
            />
          ) : (
            <ul
              className="m-0 flex list-none flex-col gap-3 p-0"
              aria-label={t("notifications.inbox.title")}
            >
              {rows.map((item) => (
                <NotificationRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      {pages > 1 && (
        <nav
          aria-label={t("notifications.inbox.pages")}
          className="flex items-center justify-between gap-3"
        >
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t("notifications.inbox.previous")}
          </Button>
          <span className="text-body-sm text-fg-secondary">
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

/** /notifications/:id: the item (marks it read) and its action. */
export function NotificationDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { id = "" } = useParams();
  const when = useFormatWhen();
  const markRead = useMarkRead();
  const item = useQuery({
    queryKey: notificationKeys.detail(id),
    queryFn: () => api.notifications.staff.get(id),
  });
  const unread = item.data && !item.data.is_read;
  const { mutate } = markRead;
  useEffect(() => {
    if (unread) mutate(id);
  }, [unread, id, mutate]);

  if (item.isError && (item.error as { status?: number }).status === 404)
    return <NotFoundContent />;
  const back = { to: "/notifications", label: t("notifications.inbox.back") };
  if (!item.data)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("notifications.inbox.title")} back={back} />
        {item.isError ? (
          <LoadError error={item.error} onRetry={() => void item.refetch()} />
        ) : (
          <ListSkeleton rows={1} label={t("notifications.loading")} />
        )}
      </div>
    );
  const data = item.data;
  const path = safeActionPath(data.action_path);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data.title}
        back={back}
        badges={<PriorityBadge item={data} />}
        description={
          <span>
            <time dateTime={data.created_at}>{when(data.created_at)}</time>
            {data.facility ? ` · ${data.facility.name}` : ""}
          </span>
        }
      />
      {data.is_withdrawn && <Badge tone="neutral">{t("notifications.inbox.withdrawn")}</Badge>}
      <p className="m-0 max-w-2xl whitespace-pre-line text-fg">{data.body}</p>
      {path && path !== `/notifications/${data.id}` && (
        <Link to={path} className={cx(buttonClassName({ variant: "primary" }), "self-start")}>
          {t("notifications.inbox.open")}
        </Link>
      )}
    </div>
  );
}
