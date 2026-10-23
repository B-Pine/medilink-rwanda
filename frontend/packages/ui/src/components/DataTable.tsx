import { CaretDown, CaretUp, CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useState, type ReactNode } from "react";

import { readPreference, writePreference } from "../preferences/storage";
import { cx } from "../utils/cx";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

export type Density = "compact" | "default" | "comfortable";
const DENSITY_ROW: Record<Density, string> = {
  compact: "h-8",
  default: "h-10",
  comfortable: "h-12",
};
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
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end gap-3">
        {onSearchChange && (
          <form
            role="search"
            className="flex min-w-64 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearchChange(searchText.trim());
            }}
          >
            <label className="sr-only" htmlFor={`${caption}-search`}>
              {labels.search}
            </label>
            <input
              id={`${caption}-search`}
              type="search"
              value={searchText}
              placeholder={labels.search}
              onChange={(event) => setSearchText(event.target.value)}
              className="block min-h-control w-full rounded-sm border border-border-input bg-surface px-3 py-2 text-body text-fg"
            />
            <Button type="submit" variant="secondary" aria-label={labels.search} className="px-3">
              <MagnifyingGlass aria-hidden="true" weight="bold" />
            </Button>
          </form>
        )}
        {toolbar}
        <label className="flex items-center gap-2 text-body-sm text-fg-secondary">
          {labels.density}
          <select
            value={density}
            onChange={(event) => chooseDensity(event.target.value as Density)}
            className="min-h-control rounded-sm border border-border-input bg-surface px-2"
          >
            {(Object.keys(DENSITY_ROW) as Density[]).map((d) => (
              <option key={d} value={d}>
                {labels.densities[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filters.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
          {filters.map((chip) => (
            <li key={chip.id}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle py-0.5 pr-1 pl-3 text-body-sm">
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

      <p className="m-0 text-body-sm text-fg-secondary" aria-live="polite">
        {loading ? "" : labels.results(total)}
      </p>

      {error ? (
        <Alert tone="danger">
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
          <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
            <table className="w-full border-collapse text-left text-body">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-10 bg-subtle">
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
                        className="border-b border-border px-3 py-2 font-semibold whitespace-nowrap"
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold text-fg"
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
                    <th scope="col" className="border-b border-border px-3 py-2 font-semibold">
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
                          <td key={header.id} className="border-b border-border px-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                        {rowActions && <td className="border-b border-border" />}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={row.id}
                        className={cx(
                          DENSITY_ROW[density],
                          onRowClick && "cursor-pointer hover:bg-subtle",
                        )}
                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      >
                        {row.getVisibleCells().map((cell, index) => (
                          <td
                            key={cell.id}
                            className="border-b border-border px-3 py-1 align-middle"
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
                            className="border-b border-border px-3 py-1 text-right whitespace-nowrap"
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
          <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-md border border-border bg-surface p-3">
                {renderCard ? (
                  renderCard(row.original)
                ) : (
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} className="contents">
                        <dt className="text-body-sm text-fg-muted">
                          {typeof cell.column.columnDef.header === "string"
                            ? cell.column.columnDef.header
                            : cell.column.id}
                        </dt>
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
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-fg-secondary">
              {emptyState}
            </div>
          )}
        </>
      )}

      <nav
        className="flex flex-wrap items-center justify-between gap-3"
        aria-label={labels.page(page, pages)}
      >
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-body-sm text-fg-secondary">
            {labels.rowsPerPage}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="min-h-control rounded-sm border border-border-input bg-surface px-2"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {labels.previous}
          </Button>
          <span className="text-body-sm text-fg-secondary">{labels.page(page, pages)}</span>
          <Button
            variant="secondary"
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
