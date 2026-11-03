import type { FacilityResult } from "@medilink/api-client";
import {
  Buildings,
  FirstAidKit,
  Hospital,
  MapPin,
  MapTrifold,
  NavigationArrow,
  SquaresFour,
  Stethoscope,
  type Icon,
} from "@phosphor-icons/react";
import { Button, cx, Skeleton, type MapPoint } from "@medilink/ui";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { pinKind } from "../booking/discovery";
import { env } from "../../env";
import { insurerNames, MapCard, RowActions, useWide, waitText } from "../booking/Places";
import { FacilityStatus } from "./kit";

const KIND_ICON: Record<ReturnType<typeof pinKind>, Icon> = {
  post: FirstAidKit,
  centre: Buildings,
  hospital: Hospital,
  clinic: Stethoscope,
};

const LOAD_DOT = { low: "bg-success", medium: "bg-warning", high: "bg-attention-solid" } as const;

/** How many insurer chips a card shows before "+N". */
const INSURERS_SHOWN = 3;

/**
 * One facility as a card (home "near you", product owner 2026-11-03): type, open now, the name,
 * the place, how far it is from the visitor (only once they shared a location), the live wait,
 * accepted insurers and one action. No prices (U-01).
 */
export function FacilityCard({
  result,
  selected = false,
  onActivate,
  onShowOnMap,
}: {
  result: FacilityResult;
  /** Its pin is selected on the map beside. */
  selected?: boolean;
  /** Pointer or focus on the card: the map highlights the pin. */
  onActivate?: () => void;
  /** "Show on map" (only when the facility has coordinates). */
  onShowOnMap?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const KindIcon = KIND_ICON[pinKind(result.type)];
  const wait = waitText(result, t, lang);
  const insurers = insurerNames(result.insurers, t);
  const place = [result.sector, result.district].filter(Boolean).join(", ");
  return (
    // Pointer and focus only highlight the map pin; the links and buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      aria-labelledby={`card-${result.slug}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      className={cx(
        "group flex h-full flex-col gap-4 rounded-3xl bg-surface p-5 shadow-card transition-[box-shadow,translate] duration-300 ease-out-quint hover:-translate-y-1 hover:shadow-raised motion-reduce:hover:translate-y-0",
        // the selected place: an emerald ring, no layout shift
        selected && "shadow-[0_0_0_2px_var(--color-primary),var(--ml-shadow-raised)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-primary"
          >
            <KindIcon weight="duotone" className="size-5" />
          </span>
          <span className="truncate text-body-sm text-fg-secondary">
            {t(`booking.types.${result.type}`, { defaultValue: result.type })}
          </span>
        </span>
        <FacilityStatus open={result.open_now} />
      </div>

      <div className="flex flex-col gap-1">
        <h3 id={`card-${result.slug}`} className="m-0 text-h3 leading-snug">
          <Link
            to={`/facilities/${result.slug}`}
            viewTransition
            className="text-fg no-underline hover:underline"
          >
            {result.name}
          </Link>
        </h3>
        {place && (
          <p className="m-0 inline-flex items-center gap-1.5 text-body-sm text-fg-muted">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {place}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {result.distance_km !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1 text-body-sm font-semibold text-info tabular-nums">
            <NavigationArrow aria-hidden="true" weight="fill" className="size-3.5" />
            {t("site.home.away", { km: result.distance_km })}
          </span>
        )}
        {wait && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-body-sm font-semibold text-fg tabular-nums">
            {result.queue_load && (
              <span
                aria-hidden="true"
                className={cx("size-2 rounded-full", LOAD_DOT[result.queue_load])}
              />
            )}
            {wait}
          </span>
        )}
      </div>

      {insurers.length > 0 && (
        <ul
          aria-label={t("site.facility.insurance")}
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {insurers.slice(0, INSURERS_SHOWN).map((name) => (
            <li
              key={name}
              className="rounded-full border border-border px-2.5 py-0.5 text-caption font-semibold text-fg-secondary"
            >
              {name}
            </li>
          ))}
          {insurers.length > INSURERS_SHOWN && (
            <li className="rounded-full px-1.5 py-0.5 text-caption font-semibold text-fg-muted">
              +{insurers.length - INSURERS_SHOWN}
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
        <RowActions result={result} />
        {onShowOnMap && result.lat !== null && result.lng !== null && (
          <button
            type="button"
            onClick={onShowOnMap}
            className="ml-auto inline-flex min-h-target cursor-pointer items-center gap-1.5 rounded-full px-2 text-body-sm font-semibold text-link transition-colors duration-150 hover:bg-brand-subtle"
          >
            <MapTrifold aria-hidden="true" className="size-4" />
            {t("site.home.showOnMap")}
          </button>
        )}
      </div>
    </article>
  );
}

/** Cards in a two-column grid (beside a map), with skeleton cards while loading. */
export function FacilityCardGrid({
  label,
  rows,
  loading,
  selected,
  onSelect,
  onShowOnMap,
  compact = false,
}: {
  label: string;
  rows: FacilityResult[];
  loading: boolean;
  selected?: string | null;
  onSelect?: (slug: string) => void;
  onShowOnMap?: (slug: string) => void;
  /** Beside a filter column and a map: one card per row until the screen is very wide. */
  compact?: boolean;
}) {
  const cols = compact ? "sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" : "sm:grid-cols-2";
  if (loading)
    return (
      <div className={cx("grid gap-4", cols)}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-3xl" />
        ))}
      </div>
    );
  return (
    <ul aria-label={label} className={cx("m-0 grid list-none gap-4 p-0", cols)}>
      {rows.map((result, index) => (
        <li
          key={result.slug}
          className="ml-reveal"
          style={{ animationRange: `entry ${(index % 2) * 10}% entry ${55 + (index % 2) * 10}%` }}
        >
          <FacilityCard
            result={result}
            selected={selected === result.slug}
            onActivate={onSelect && (() => onSelect(result.slug))}
            onShowOnMap={onShowOnMap && (() => onShowOnMap(result.slug))}
          />
        </li>
      ))}
    </ul>
  );
}

// Leaflet and the tiles load only when the map is on screen (upgrade 03 §2, < 100 KB JS budget)
const FacilityMap = lazy(() => import("@medilink/ui/map"));

/**
 * Facilities as cards with a map (home, /facilities): on wide screens the map stays beside the
 * cards and each highlights the other; on phones Cards / Map switch, and "Show on map" opens the
 * pin. Loading, failure and empty states are part of it, so every page shows them the same way.
 */
export function FacilityExplorer({
  label,
  rows,
  loading,
  fetching = false,
  failed = false,
  onRetry,
  near = null,
  empty,
}: {
  label: string;
  rows: FacilityResult[];
  loading: boolean;
  /** A new page of results is on its way: the cards dim instead of jumping. */
  fetching?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  /** The visitor's position, drawn on the map when shared. */
  near?: { lat: number; lng: number } | null;
  empty: ReactNode;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const map = useRef<HTMLDivElement>(null);
  // false while the pre-rendered page hydrates (Leaflet needs the browser), then true
  const inBrowser = useWide("all");
  const points: MapPoint[] = rows.flatMap((r) =>
    r.lat !== null && r.lng !== null
      ? [
          {
            id: r.slug,
            lat: r.lat,
            lng: r.lng,
            kind: pinKind(r.type),
            load: r.queue_load,
            label: r.name,
          },
        ]
      : [],
  );
  const chosen = rows.find((r) => r.slug === selected);

  if (failed)
    return (
      <p
        role="alert"
        className="m-0 flex items-center gap-3 rounded-2xl bg-surface p-5 shadow-card"
      >
        {t("home.failed")}
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("home.retry")}
          </Button>
        )}
      </p>
    );
  if (!loading && rows.length === 0)
    return <div className="rounded-3xl bg-surface shadow-card">{empty}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* phones and tablets: one view at a time */}
      <div
        role="group"
        aria-label={t("home.view.label")}
        className="flex self-start rounded-full bg-subtle p-1 lg:hidden"
      >
        {(["list", "map"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
          >
            {key === "list" ? (
              <SquaresFour aria-hidden="true" className="size-4" />
            ) : (
              <MapTrifold aria-hidden="true" className="size-4" />
            )}
            {t(`site.home.view.${key}`)}
          </button>
        ))}
      </div>
      {/* wide screens: the cards beside a map that stays in view */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div
          className={cx(
            "min-w-0 transition-opacity duration-200 ease-out-quint",
            fetching && !loading && "opacity-60",
            view === "map" && "hidden lg:block",
          )}
        >
          <FacilityCardGrid
            label={label}
            rows={rows}
            loading={loading}
            selected={selected}
            onSelect={setSelected}
            onShowOnMap={(slug) => {
              setSelected(slug);
              setView("map");
              map.current?.scrollIntoView({ block: "nearest" });
            }}
          />
        </div>
        <div
          ref={map}
          className={cx("scroll-mt-24 lg:sticky lg:top-24", view === "list" && "hidden lg:block")}
        >
          {inBrowser ? (
            <Suspense fallback={<Skeleton className="h-[28rem] rounded-3xl lg:h-[34rem]" />}>
              <FacilityMap
                points={points}
                selectedId={selected}
                onSelect={setSelected}
                you={near}
                tilesUrl={env.mapTilesUrl}
                attribution={t("home.mapAttribution")}
                label={t("home.mapLabel")}
                className="h-[28rem] lg:h-[34rem]"
                card={chosen ? <MapCard result={chosen} /> : undefined}
              />
            </Suspense>
          ) : (
            <Skeleton className="h-[28rem] rounded-3xl lg:h-[34rem]" />
          )}
        </div>
      </div>
    </div>
  );
}
