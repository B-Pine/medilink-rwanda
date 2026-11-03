import type { PharmacyQueueRow, PharmacyQueueTab } from "@medilink/api-client";
import {
  Alert,
  Badge,
  EmptyState,
  LoadingState,
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
  TextField,
  TicketNumber,
} from "@medilink/ui";
import {
  ArrowRight,
  ChatCircleDots,
  Package,
  Pill,
  ShieldWarning,
  Storefront,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, Pager, pharmacyKeys, useCan, useWhen } from "./shared";

const TABS: PharmacyQueueTab[] = ["ready", "partly", "queried"];

/**
 * /pharmacy (S7-F2, FR-PHA-02): the facility's prescriptions to give, oldest first, in three tabs.
 * Each row leads with who is at the counter (ticket, name, age), then what is waiting and its flags.
 */
export function QueuePage() {
  const { t } = useTranslation();
  const api = useApi();
  const allowed = useCan("pharmacy.dispense");
  const [tab, setTab] = useState<PharmacyQueueTab>("ready");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...pharmacyKeys.queue(tab, q), page],
    queryFn: () => api.pharmacy.queue({ status: tab, q, page }),
    enabled: allowed,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data?.results ?? [];
  const results = list.isPending ? (
    <LoadingState label={t("pharmacy.loading")} />
  ) : list.isError ? (
    <Alert tone="danger" role="alert">
      {errorText(list.error, t("errors.generic"))}
    </Alert>
  ) : rows.length ? (
    <ul
      aria-label={t(`pharmacy.queue.tab.${tab}`)}
      className="m-0 flex list-none flex-col gap-2 p-0"
    >
      {rows.map((row) => (
        <QueueItem key={row.id} row={row} />
      ))}
      <li className="list-none">
        <Pager
          page={page}
          hasPrevious={Boolean(list.data?.previous)}
          hasNext={Boolean(list.data?.next)}
          onPage={setPage}
        />
      </li>
    </ul>
  ) : (
    <EmptyState
      icon={Package}
      title={t(q ? "pharmacy.queue.noMatch" : `pharmacy.queue.empty.${tab}`)}
      description={q ? t("pharmacy.queue.noMatchBody") : undefined}
    />
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader title={t("pharmacy.queue.title")} description={t("pharmacy.queue.description")} />
      <TextField
        type="search"
        label={t("pharmacy.queue.search")}
        hint={t("pharmacy.queue.searchHint")}
        value={search}
        onChange={(event) => {
          setPage(1);
          setSearch(event.target.value);
        }}
        className="w-full sm:w-80"
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setPage(1);
          setTab(value as PharmacyQueueTab);
        }}
      >
        <TabsList aria-label={t("pharmacy.queue.tabs")}>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`pharmacy.queue.tab.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            {key === tab && results}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function QueueItem({ row }: { row: PharmacyQueueRow }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <li className="group relative flex animate-enter flex-wrap items-center gap-4 rounded-2xl bg-surface p-4 shadow-card transition-[box-shadow,transform] duration-200 ease-out-quint hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0">
      {row.ticket_number ? (
        <TicketNumber number={row.ticket_number} size="sm" stub tone="brand" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-subtle text-fg-muted">
          <Pill aria-hidden="true" weight="duotone" className="size-6" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/pharmacy/prescriptions/${row.id}`}
          className="font-heading text-h3 font-bold text-fg no-underline after:absolute after:inset-0 after:rounded-2xl group-hover:underline"
        >
          {row.patient_display_name}
        </Link>
        <p className="m-0 flex flex-wrap gap-x-3 text-body-sm text-fg-muted">
          {row.patient_age !== null && <span>{t("pharmacy.age", { count: row.patient_age })}</span>}
          <span className="font-mono">{row.number}</span>
          <span>{t("pharmacy.queue.issued", { time: when.dateTime(row.issued_at) })}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {row.has_controlled && (
            <Badge tone="warning" icon={ShieldWarning}>
              {t("pharmacy.flag.controlled")}
            </Badge>
          )}
          {row.has_open_query && (
            <Badge tone="info" icon={ChatCircleDots}>
              {t("pharmacy.flag.queried")}
            </Badge>
          )}
          {row.has_unavailable && (
            <Badge tone="danger" icon={Storefront}>
              {t("pharmacy.flag.notInStock")}
            </Badge>
          )}
        </div>
      </div>
      <span className="flex items-center gap-2 text-body-sm font-semibold text-fg-secondary">
        {t("pharmacy.queue.items", { count: row.item_count })}
        <ArrowRight aria-hidden="true" className="size-icon" />
      </span>
    </li>
  );
}
