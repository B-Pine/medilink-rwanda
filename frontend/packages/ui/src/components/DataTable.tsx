import { CaretDown, CaretUp, CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useId, useState, type ReactNode } from "react";

import { readPreference, writePreference } from "../preferences/storage";
import { cx } from "../utils/cx";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

/**
 * Column meta read by the table (design 08 §2): `align: "right"` for numbers, money and durations
 * (tabular figures); `label` names the column where the header is not plain text (card list under
 * 640 px).
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TData and TValue must match TanStack's declaration
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right" | "center";
    label?: string;
  }
}

const ALIGN = { left: "text-left", right: "text-right tabular-nums", center: "text-center" };

function alignClass<T>(column: Column<T, unknown>): string {
  return ALIGN[column.columnDef.meta?.align ?? "left"];
}

function columnLabel<T>(column: Column<T, unknown>): string {
  const { meta, header } = column.columnDef;
  return meta?.label ?? (typeof header === "string" ? header : column.id);
}

export type Density = "compact" | "default" | "comfortable";
const DENSITY_ROW: Record<Density, string> = {
  compact: "h-11",
  default: "h-14",
  comfortable: "h-16",
};

/**
 * Filter selects passed in `toolbar` sit inline: a small muted label left of a compact pill, so
 * the toolbar reads as one row (staff redesign 2026-11-02).
 */
const TOOLBAR = cx(
  "flex flex-wrap items-center gap-3",
  "[&_div:has(>select)]:flex-row [&_div:has(>select)]:items-center [&_div:has(>select)]:gap-2",
  "[&_div:has(>select)>label]:text-body-sm [&_div:has(>select)>label]:font-medium [&_div:has(>select)>label]:whitespace-nowrap [&_div:has(>select)>label]:text-fg-muted",
  "[&_select]:min-h-10 [&_select]:w-auto [&_select]:rounded-full [&_select]:py-1.5 [&_select]:text-body-sm",
);
export const PAGE_SIZES = [25, 50, 100] as const;

export interface FilterChip {
  id: string;
  label: ReactNode;
  onRemove: () => void;
}

export interface DataTableLabels {
  search: string;
  clearAll: string;
  removeFilter: string;
  /** e.g. (count) => `${count} results` */
  results: (count: number) => string;
  rowsPerPage: string;
  previous: string;
  next: string;
  /** e.g. (page, pages) => `Page ${page} of ${pages}` */
  page: (page: number, pages: number) => string;
  density: string;
  densities: Record<Density, string>;
  actions: string;
  empty: ReactNode;
  noResults: ReactNode;
  error: ReactNode;
  retry: string;
}

export interface DataTableProps<T> {
  /** Accessible table name (caption, visually hidden). */
  caption: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  labels: DataTableLabels;
  /** Server-side total, sorting and pagination. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterChip[];
  onClearFilters?: () => void;
  /** Toolbar content (filter selects, tabs) next to the search. */
  toolbar?: ReactNode;
  /** Always-visible actions at the end of each row. */
  rowActions?: (row: T) => ReactNode;
  /** Row click (e.g. open a SidePanel); the first cell becomes a button for keyboard users. */
  onRowClick?: (row: T) => void;
  /** Card body under 640 px (defaults to the column cells as label: value). */
  renderCard?: (row: T) => ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** True when search or filters are active (empty → "no results" instead of "empty"). */
  filtered?: boolean;
  className?: string;
}

function storedDensity(): Density {
  const value = readPreference("tableDensity");
  return value === "compact" || value === "comfortable" ? value : "default";
}

/**
 * Server-driven data table (design 08 §2–4): search and removable filter chips, result count,
 * sticky header with aria-sort, server sorting and pagination (25/50/100), three densities
 * remembered on this device, always-visible row actions, skeleton / empty / no-results / error
 * states, and a card list under 640 px.
 */
export function DataTable<T>({
  caption,
  columns,
  data,
  getRowId,
  labels,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sorting = [],
  onSortingChange,
  search,
  onSearchChange,
  filters = [],
  onClearFilters,
  toolbar,
  rowActions,
  onRowClick,
  renderCard,
  loading = false,
  error = false,
  onRetry,
  filtered = false,
  className,
}: DataTableProps<T>) {
  const searchId = useId();
  const [density, setDensity] = useState<Density>(storedDensity);
  const [searchText, setSearchText] = useState(search ?? "");
  useEffect(() => setSearchText(search ?? ""), [search]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange?.(next);
    },
    enableSortingRemoval: true,
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const rows = table.getRowModel().rows;
  const headers = table.getHeaderGroups()[0]?.headers ?? [];

  function chooseDensity(value: Density) {
    setDensity(value);
    writePreference("tableDensity", value);
  }

  const emptyState = filtered ? labels.noResults : labels.empty;

  return (
    <div
      className={cx("flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card", className)}
    >
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">
        {onSearchChange && (
          <form
            role="search"
            className="group flex min-h-10 min-w-64 flex-1 items-center gap-2 rounded-full border border-border bg-page pr-1.5 pl-4 transition-[border-color,box-shadow] duration-150 ease-out-quint focus-within:border-primary focus-within:bg-surface focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)] md:max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              onSearchChange(searchText.trim());
            }}
          >
            <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
            <label className="sr-only" htmlFor={searchId}>
              {labels.search}
            </label>
            <input
              id={searchId}
              type="search"
              value={searchText}
              placeholder={labels.search}
              onChange={(event) => setSearchText(event.target.value)}
              className="min-h-9 w-full min-w-0 border-0 bg-transparent text-body-sm text-fg outline-none placeholder:text-fg-muted"
            />
            <button type="submit" className="sr-only">
              {labels.search}
            </button>
          </form>
        )}
        {toolbar && <div className={TOOLBAR}>{toolbar}</div>}
        <div className="ml-auto flex items-center gap-3">
          <p className="m-0 text-body-sm text-fg-muted tabular-nums" aria-live="polite">
            {loading ? "" : labels.results(total)}
          </p>
          <label className="flex items-center gap-2 text-body-sm text-fg-muted">
            <span className="sr-only sm:not-sr-only">{labels.density}</span>
            <select
              value={density}
              onChange={(event) => chooseDensity(event.target.value as Density)}
              className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 text-body-sm text-fg transition-colors duration-150 ease-out-quint hover:border-fg-muted"
            >
              {(Object.keys(DENSITY_ROW) as Density[]).map((d) => (
                <option key={d} value={d}>
                  {labels.densities[d]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filters.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap items-center gap-2 px-5 pb-4">
          {filters.map((chip) => (
            <li key={chip.id} className="animate-enter">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-subtle py-0.5 pr-1 pl-3 text-body-sm font-semibold text-on-brand-subtle">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-surface"
                  aria-label={`${labels.removeFilter}: ${typeof chip.label === "string" ? chip.label : chip.id}`}
                >
                  <X aria-hidden="true" weight="bold" />
                </button>
              </span>
            </li>
          ))}
          {onClearFilters && (
            <li>
              <Button variant="ghost" onClick={onClearFilters}>
                {labels.clearAll}
              </Button>
            </li>
          )}
        </ul>
      )}

      {error ? (
        <Alert tone="danger" className="mx-5 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span>{labels.error}</span>
            {onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                {labels.retry}
              </Button>
            )}
          </div>
        </Alert>
      ) : (
        <>
          {/* Table (640 px and wider) */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-body-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-10 bg-page/80">
                <tr>
                  {headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort() && Boolean(onSortingChange);
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : canSort
                                ? "none"
                                : undefined
                        }
                        className={cx(
                          "border-y border-border/60 px-5 py-3 text-caption font-semibold tracking-wider whitespace-nowrap text-fg-muted uppercase",
                          alignClass(header.column),
                        )}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold tracking-wider text-fg-muted uppercase transition-colors duration-150 hover:text-fg"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <CaretUp aria-hidden="true" />
                            ) : sorted === "desc" ? (
                              <CaretDown aria-hidden="true" />
                            ) : (
                              <CaretUpDown aria-hidden="true" className="text-fg-muted" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                  {rowActions && (
                    <th scope="col" className="border-y border-border/60 px-5 py-3">
                      <span className="sr-only">{labels.actions}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }, (_, index) => (
                      <tr key={`skeleton-${index}`} className={DENSITY_ROW[density]}>
                        {headers.map((header) => (
                          <td key={header.id} className="border-b border-border/50 px-5">
                            <Skeleton className="h-4 w-full rounded-md" />
                          </td>
                        ))}
                        {rowActions && <td className="border-b border-border/50" />}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        className={cx(
                          DENSITY_ROW[density],
                          "group/row transition-colors duration-150 ease-out-quint hover:bg-subtle/50 [&:last-child>td]:border-b-0",
                          onRowClick && "cursor-pointer",
                        )}
                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      >
                        {row.getVisibleCells().map((cell, index) => (
                          <td
                            key={cell.id}
                            className={cx(
                              "border-b border-border/50 px-5 py-2 align-middle text-fg-secondary",
                              index === 0 && "font-semibold text-fg",
                              alignClass(cell.column),
                            )}
                          >
                            {index === 0 && onRowClick ? (
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-link underline-offset-2 hover:underline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRowClick(row.original);
                                }}
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </button>
                            ) : (
                              flexRender(cell.column.columnDef.cell, cell.getContext())
                            )}
                          </td>
                        ))}
                        {rowActions && (
                          <td
                            className="border-b border-border/50 px-5 py-2 text-right whitespace-nowrap [&_a]:min-h-9 [&_a]:rounded-full [&_a]:px-4 [&_a]:text-body-sm [&_button]:min-h-9 [&_button]:rounded-full [&_button]:px-4 [&_button]:text-body-sm"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {rowActions(row.original)}
                          </td>
                        )}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Card list (under 640 px) */}
          <ul className="m-0 flex list-none flex-col gap-2 px-4 pb-4 sm:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-border/60 bg-surface p-4">
                {renderCard ? (
                  renderCard(row.original)
                ) : (
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} className="contents">
                        <dt className="text-body-sm text-fg-muted">{columnLabel(cell.column)}</dt>
                        <dd className="m-0">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {onRowClick && (
                    <Button variant="secondary" onClick={() => onRowClick(row.original)}>
                      {labels.actions}
                    </Button>
                  )}
                  {rowActions?.(row.original)}
                </div>
              </li>
            ))}
          </ul>

          {!loading && rows.length === 0 && (
            <div className="px-5 py-14 text-center text-fg-secondary">{emptyState}</div>
          )}
        </>
      )}

      <nav
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3"
        aria-label={labels.page(page, pages)}
      >
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-body-sm text-fg-muted">
            {labels.rowsPerPage}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 text-body-sm text-fg"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            pill
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {labels.previous}
          </Button>
          <span className="px-1 text-body-sm text-fg-muted tabular-nums">
            {labels.page(page, pages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            pill
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            {labels.next}
          </Button>
        </div>
      </nav>
    </div>
  );
}

export type { ColumnDef, SortingState };
