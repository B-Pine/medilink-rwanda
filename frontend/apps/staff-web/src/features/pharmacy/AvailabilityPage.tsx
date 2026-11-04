import type { AvailabilityRow } from "@medilink/api-client";
import { Alert, EmptyState, LoadingState, SwitchField, TextField } from "@medilink/ui";
import { Pill } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, Pager, pharmacyKeys, useCan, useWhen } from "./shared";

/**
 * /pharmacy/availability (S7-F4, FR-PHA-04): what this facility has on the shelf. Doctors see
 * "not in stock here" in their drug search; prescribing stays allowed (the patient buys outside).
 */
export function AvailabilityPage() {
  const { t } = useTranslation();
  const api = useApi();
  const canView = useCan("pharmacy.availability", "pharmacy.dispense");
  const canChange = useCan("pharmacy.availability");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...pharmacyKeys.availability(q), page],
    queryFn: () => api.pharmacy.availability({ q, page }),
    enabled: canView,
    placeholderData: keepPreviousData,
  });
  if (!canView) return <NoAccessContent />;
  const rows = list.data?.results ?? [];
  const out = rows.filter((r) => !r.is_available).length;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={t("pharmacy.availability.title")}
        description={t("pharmacy.availability.description")}
      />
      <TextField
        type="search"
        label={t("pharmacy.availability.search")}
        value={search}
        onChange={(event) => {
          setPage(1);
          setSearch(event.target.value);
        }}
        className="sm:w-80"
      />
      {list.isPending ? (
        <LoadingState label={t("pharmacy.loading")} />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : rows.length ? (
        <>
          <p className="m-0 text-body-sm text-fg-muted" aria-live="polite">
            {t("pharmacy.availability.summary", { count: out })}
          </p>
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 rounded-2xl bg-surface px-4 shadow-card">
            {rows.map((row) => (
              <AvailabilityItem key={row.drug_code} row={row} canChange={canChange} />
            ))}
          </ul>
          <Pager
            page={page}
            hasPrevious={Boolean(list.data?.previous)}
            hasNext={Boolean(list.data?.next)}
            onPage={setPage}
          />
        </>
      ) : (
        <EmptyState icon={Pill} title={t("pharmacy.availability.none")} />
      )}
    </div>
  );
}

function AvailabilityItem({ row, canChange }: { row: AvailabilityRow; canChange: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (value: boolean) => api.pharmacy.setAvailability(row.drug_code, value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...pharmacyKeys.all, "availability"] }),
  });
  return (
    <li className="flex flex-col gap-1 py-3">
      <SwitchField
        label={row.display}
        hint={
          row.follows_stock
            ? t("pharmacy.availability.followsStock")
            : row.updated_at && !row.is_available
              ? t("pharmacy.availability.since", { date: when.date(row.updated_at) })
              : undefined
        }
        checked={row.is_available}
        // W5: a medicine with stock follows its count; receive or adjust it on the stock page
        disabled={!canChange || change.isPending || row.follows_stock}
        stateLabel={
          row.stock_level
            ? t(`pharmacy.stock.level.${row.stock_level}`)
            : row.is_available
              ? t("pharmacy.availability.in")
              : t("pharmacy.availability.out")
        }
        onCheckedChange={(value) => change.mutate(value)}
      />
      {change.isError && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {errorText(change.error, t("errors.generic"))}
        </p>
      )}
    </li>
  );
}
