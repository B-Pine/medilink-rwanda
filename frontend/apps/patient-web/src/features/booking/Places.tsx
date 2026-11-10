import type { FacilityResult } from "@medilink/api-client";
import { List as ListIcon, MapTrifold } from "@phosphor-icons/react";
import {
  Button,
  buttonClassName,
  cx,
  FacilityList,
  FacilityRow,
  Select,
  type MapPoint,
  Skeleton,
} from "@medilink/ui";
import type { TFunction } from "i18next";
import {
  Children,
  isValidElement,
  lazy,
  Suspense,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { env } from "../../env";
import { useInDashboard } from "../../layout/DashboardContext";
import { FacilityEntries } from "../site/FacilityDirectory";
import { EmptyState } from "../site/kit";
import { INSURER_CODES, INSURER_KEYS, pinKind, time, type InsurerKey } from "./discovery";

// Leaflet and the tiles load only when the map is on screen (upgrade 03 §2, < 100 KB JS budget)
const FacilityMap = lazy(() => import("@medilink/ui/map"));

/** Pill chip: a toggle (aria-pressed) or a link; presses scale like buttons (upgrade 02 §6). */
export const CHIP =
  "inline-flex min-h-target cursor-pointer items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold no-underline select-none " +
  "bg-subtle text-fg transition-[background-color,color,transform] duration-150 ease-out-quint " +
  "hover:bg-brand-subtle active:scale-[0.97] aria-pressed:bg-primary aria-pressed:text-on-primary motion-reduce:active:scale-100";

/** Compact filter control (select or toggle) with the same height and border as inputs. */
export const FILTER =
  "min-h-target cursor-pointer rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg " +
  "transition-[border-color,background-color,color] duration-150 ease-out-quint hover:border-fg-muted " +
  "aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle";

/** A filter select whose first option names it ("All districts"); the label is for screen readers. */
export function FilterSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  // the shared select (same look in every browser); callers keep writing <option>s
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{ value?: string; children?: ReactNode }>(child)
      ? [{ value: String(child.props.value ?? ""), label: textOf(child.props.children) }]
      : [],
  );
  if (disabled) {
    const current = options.find((o) => o.value === value) ?? options[0];
    return (
      <span aria-disabled="true" className={cx(FILTER, "inline-flex items-center opacity-60")}>
        <span className="sr-only">{label}: </span>
        {current?.label}
      </span>
    );
  }
  return (
    <Select
      id={id}
      label={label}
      hideLabel
      shape="pill"
      value={value}
      onChange={onChange}
      options={options}
      className={cx(
        "min-w-[10rem] [&>button]:min-h-11 [&>button]:text-body-sm [&>button]:font-semibold",
        value &&
          "[&>button]:bg-brand-subtle [&>button]:text-on-brand-subtle [&>button]:shadow-[0_0_0_1px_var(--color-primary)]",
      )}
    />
  );
}

/** The text of an <option>'s children (strings and numbers). */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
    .join("");
}

/** Sort: open first, shortest wait, or nearest (once the location is shared). */
export function SortSelect({
  id,
  value,
  onChange,
  near,
}: {
  id: string;
  value: Sort;
  onChange: (value: Sort) => void;
  near: boolean;
}) {
  const { t } = useTranslation();
  const options: { value: Sort; label: string }[] = [
    { value: "open", label: t("site.sort.open") },
    { value: "soonest", label: t("site.sort.soonest") },
    ...(near ? [{ value: "nearest" as const, label: t("site.sort.nearest") }] : []),
  ];
  return (
    <Select<Sort>
      id={id}
      label={t("home.sort.label")}
      hideLabel
      shape="pill"
      value={value === "nearest" && !near ? "open" : value}
      onChange={onChange}
      options={options}
      className="min-w-[11rem] [&>button]:min-h-10 [&>button]:text-body-sm [&>button]:font-semibold"
    />
  );
}

/** Facility types offered as a filter (S1 types; upgrade 03 §3). */
export const TYPES = [
  "health_post",
  "health_center",
  "private_clinic",
  "polyclinic",
  "district_hospital",
  "provincial_hospital",
  "referral_hospital",
] as const;

export type Sort = "soonest" | "nearest" | "name" | "open";

const INSURER_KEY_BY_CODE: Record<string, InsurerKey> = Object.fromEntries(
  INSURER_KEYS.filter((key) => INSURER_CODES[key]).map((key) => [INSURER_CODES[key], key]),
);

function minutesUntil(iso: string | null): number {
  return iso ? Math.max(0, (Date.parse(iso) - Date.now()) / 60_000) : Number.POSITIVE_INFINITY;
}

/** "Soonest seen": the wait for walk-ins, else the next free time, then distance. */
function soonest(result: FacilityResult): number {
  if (result.wait_range) return result.wait_range.max;
  if (result.waiting === 0) return 0;
  return minutesUntil(result.next_slot_at);
}

export function sortResults(results: FacilityResult[], sort: Sort): FacilityResult[] {
  const copy = [...results];
  const far = (r: FacilityResult) => r.distance_km ?? Number.POSITIVE_INFINITY;
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "nearest") return copy.sort((a, b) => far(a) - far(b));
  if (sort === "open")
    return copy.sort(
      (a, b) =>
        Number(b.open_now) - Number(a.open_now) || soonest(a) - soonest(b) || far(a) - far(b),
    );
  return copy.sort((a, b) => soonest(a) - soonest(b) || far(a) - far(b));
}

export function insurerNames(codes: string[], t: TFunction): string[] {
  return codes.map((code) =>
    INSURER_KEY_BY_CODE[code] ? t(`landing.insurersShort.${INSURER_KEY_BY_CODE[code]}`) : code,
  );
}

/** "6 waiting · 20–30 min", "No wait" or "Next 10:30": numbers, not sentences (upgrade 02 §8). */
export function waitText(r: FacilityResult, t: TFunction, lang: string): string {
  if (r.waiting !== null && r.waiting !== undefined) {
    if (r.waiting === 0) return t("home.noWait");
    if (r.wait_range)
      return t("home.wait", { count: r.waiting, min: r.wait_range.min, max: r.wait_range.max });
    return t("home.waiting", { count: r.waiting });
  }
  if (r.next_slot_at) return t("home.next", { time: time(r.next_slot_at, lang) });
  return "";
}

/** One action (Join or Book) and View (upgrade 03 §2). */
export function RowActions({ result }: { result: FacilityResult }) {
  const { t } = useTranslation();
  const join = result.allows_remote_join;
  return (
    <>
      {(join || result.next_slot_at) && (
        <Link to={`/book/${result.slug}`} viewTransition className={buttonClassName({})}>
          {join ? t("home.join") : t("home.book")}
        </Link>
      )}
      <Link
        viewTransition
        to={`/facilities/${result.slug}`}
        className={buttonClassName({ variant: "ghost" })}
      >
        {t("home.viewLink")}
      </Link>
    </>
  );
}

export function MapCard({ result }: { result: FacilityResult }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{result.name}</span>
        {result.distance_km !== null && (
          <span className="text-body-sm text-fg-secondary tabular-nums">
            {t("booking.search.km", { km: result.distance_km })}
          </span>
        )}
      </p>
      <p className="m-0 text-body-sm text-fg-secondary">
        {[waitText(result, t, lang), ...insurerNames(result.insurers, t)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex gap-2">
        <RowActions result={result} />
      </div>
    </div>
  );
}

/** Desktop (≥ 1024 px): the map sits beside the list instead of behind a toggle. */
const WIDE = "(min-width: 64rem)";
/** Inside the dashboard the sidebar takes 248 px: the map sits beside the list from 1280 px. */
const WIDE_IN_DASHBOARD = "(min-width: 80rem)";

const subscribers = new Map<string, (change: () => void) => () => void>();
function subscribeTo(query: string): (change: () => void) => () => void {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (change) => {
      const media = window.matchMedia?.(query);
      media?.addEventListener("change", change);
      return () => media?.removeEventListener("change", change);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

export function useWide(query: string = WIDE): boolean {
  // false while the pre-rendered markup hydrates (it has no map), then the real width
  return useSyncExternalStore(
    subscribeTo(query),
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}

/**
 * The live list of places with its map (upgrade 03 §2–3), shared by Home and Find care: a title row
 * with the count, sort and (on phones) List | Map; the `FacilityRow` list; the map beside it on
 * desktop. Rows and the map highlight each other.
 */
export function PlacesView({
  heading,
  headingId,
  headingLevel = 2,
  rows,
  state,
  busy = false,
  onRetry,
  near,
  sort,
  onSort,
  empty,
  toolbar,
  directory = false,
}: {
  heading: string;
  headingId: string;
  headingLevel?: 1 | 2;
  rows: FacilityResult[];
  state: "pending" | "error" | "success";
  /** New results are loading over the shown ones: the list dims instead of jumping. */
  busy?: boolean;
  onRetry: () => void;
  near: { lat: number; lng: number } | null;
  sort: Sort;
  onSort: (sort: Sort) => void;
  /** Shown when nothing matches: one line and one action (upgrade 02 §8). */
  empty: ReactNode;
  /** Extra controls in the title row (e.g. the Filters button). */
  toolbar?: ReactNode;
  /** The public directory rows instead of the table (Find care, public design brief 2026-11-04). */
  directory?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const inDashboard = useInDashboard();
  const wide = useWide(inDashboard ? WIDE_IN_DASHBOARD : WIDE);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  // the directory brings its own surface; loading, failure and empty states sit on this one
  const ownSurface = directory && state === "success" && rows.length > 0;

  const points: MapPoint[] = rows.flatMap((r) =>
    r.lat !== null && r.lng !== null
      ? [
          {
            id: r.slug,
            lat: r.lat,
            lng: r.lng,
            kind: pinKind(r.type),
            load: r.queue_load,
            label: `${r.name}, ${waitText(r, t, lang)}`,
          },
        ]
      : [],
  );
  const chosen = rows.find((r) => r.slug === selected);

  return (
    <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Heading
          id={headingId}
          className={cx(
            "m-0",
            headingLevel === 1 ? "text-h1" : inDashboard ? "text-h3 font-bold" : "text-h2",
          )}
        >
          {heading}
        </Heading>
        {state === "success" && (
          <span role="status" className="text-body-sm text-fg-muted tabular-nums">
            {t("home.count", { count: rows.length })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {toolbar}
          <label className="flex items-center gap-2 text-body-sm text-fg-secondary">
            {t("home.sort.label")}
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value as Sort)}
              className="min-h-target rounded-md border border-border-input bg-surface px-2 text-body-sm text-fg"
            >
              <option value="soonest">{t("home.sort.soonest")}</option>
              {near && <option value="nearest">{t("home.sort.nearest")}</option>}
              <option value="name">{t("home.sort.name")}</option>
            </select>
          </label>
          <div
            role="group"
            aria-label={t("home.view.label")}
            className={cx(
              "flex rounded-md bg-subtle p-0.5",
              inDashboard ? "xl:hidden" : "lg:hidden",
            )}
          >
            {(["list", "map"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className="inline-flex min-h-target cursor-pointer items-center gap-1.5 rounded-[5px] px-3 text-body-sm font-semibold text-fg-secondary aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
              >
                {key === "list" ? (
                  <ListIcon aria-hidden="true" className="size-4" />
                ) : (
                  <MapTrifold aria-hidden="true" className="size-4" />
                )}
                {t(`home.view.${key}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cx(
          "grid gap-4",
          inDashboard ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : "lg:grid-cols-[minmax(0,1fr)_26rem]",
        )}
      >
        <div
          className={cx(
            "min-w-0",
            !ownSurface && "overflow-hidden bg-surface",
            !ownSurface &&
              (inDashboard || directory
                ? "rounded-2xl border border-border"
                : "rounded-3xl shadow-card"),
            "transition-opacity duration-200 ease-out-quint",
            busy && "opacity-60",
            !wide && view === "map" && "hidden",
          )}
        >
          {state === "pending" ? (
            <div className="flex flex-col gap-3 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : state === "error" ? (
            <p role="alert" className="m-0 flex items-center gap-3 p-4">
              {t("home.failed")}
              <Button variant="secondary" onClick={onRetry}>
                {t("home.retry")}
              </Button>
            </p>
          ) : rows.length === 0 ? (
            typeof empty === "string" ? (
              <EmptyState title={empty} />
            ) : (
              empty
            )
          ) : directory ? (
            <FacilityEntries
              label={heading}
              rows={rows}
              loading={false}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <FacilityList
              labels={{
                list: heading,
                name: t("home.columns.name"),
                type: t("home.columns.type"),
                distance: t("home.columns.distance"),
                status: t("home.columns.status"),
                wait: t("home.columns.wait"),
              }}
            >
              {rows.map((r) => (
                <FacilityRow
                  key={r.slug}
                  title={
                    <Link
                      viewTransition
                      to={`/facilities/${r.slug}`}
                      className="text-fg no-underline hover:underline"
                    >
                      {r.name}
                    </Link>
                  }
                  type={t(`booking.types.${r.type}`, { defaultValue: r.type })}
                  distance={
                    r.distance_km !== null ? t("booking.search.km", { km: r.distance_km }) : null
                  }
                  open={{
                    isOpen: r.open_now,
                    label: r.open_now ? t("home.open") : t("home.closed"),
                  }}
                  wait={{ text: waitText(r, t, lang), tone: r.queue_load }}
                  insurers={insurerNames(r.insurers, t)}
                  selected={selected === r.slug}
                  onActivate={() => setSelected(r.slug)}
                  actions={<RowActions result={r} />}
                />
              ))}
            </FacilityList>
          )}
        </div>
        {(wide || view === "map") && (
          <Suspense fallback={<Skeleton className="h-[28rem] lg:h-full" />}>
            <FacilityMap
              points={points}
              selectedId={selected}
              onSelect={setSelected}
              you={near}
              tilesUrl={env.mapTilesUrl}
              attribution={t("home.mapAttribution")}
              label={t("home.mapLabel")}
              className={
                inDashboard
                  ? "h-[28rem] xl:sticky xl:top-20 xl:h-[36rem]"
                  : "h-[28rem] lg:sticky lg:top-4 lg:h-[36rem]"
              }
              card={chosen ? <MapCard result={chosen} /> : undefined}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

/** "Near me": asks for the position only when tapped; it stays in memory (S5 D-2). */
export function useNearMe(onFound?: () => void) {
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
        onFound?.();
      },
      () => setLocating("denied"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };
  return { near, setNear, locating, locate };
}
