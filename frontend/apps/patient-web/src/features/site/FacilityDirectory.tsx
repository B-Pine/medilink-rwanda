import type { FacilityResult } from "@medilink/api-client";
import { ArrowRight, List as ListIcon, MapTrifold, Siren } from "@phosphor-icons/react";
import { Button, cx, Skeleton, type MapPoint } from "@medilink/ui";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { pinKind } from "../booking/discovery";
import { env } from "../../env";
import { insurerNames, MapCard, useWide, waitText } from "../booking/Places";

/**
 * Facilities as a directory, not a shop (public design brief 2026-11-04): one quiet surface, one
 * row per place divided by hairlines, the facts a person needs in words (what it is, where, open or
 * busy, the wait, the insurance it accepts) and the next step as a link. No box per place, no
 * photos, no shadows. No prices (U-01).
 */

/** Open, busy or closed: a word with a small mark, never colour alone. */
function Status({ result }: { result: FacilityResult }) {
  const { t } = useTranslation();
  const busy = result.open_now && result.queue_load === "high";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 font-semibold",
        !result.open_now ? "text-fg-secondary" : busy ? "text-attention" : "text-success",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-2 rounded-full",
          !result.open_now ? "border border-fg-muted" : busy ? "bg-attention-solid" : "bg-success",
        )}
      />
      {!result.open_now ? t("site.card.closed") : busy ? t("site.card.busy") : t("site.card.open")}
    </span>
  );
}

/**
 * One facility in the directory. Narrow lists stack the facts in reading order; from 48 rem of
 * list width the place sits on the left and its status, wait and next step in a column on the
 * right, so the eye runs down one column to compare waits.
 */
export function FacilityEntry({
  result,
  selected = false,
  onActivate,
  onShowOnMap,
}: {
  result: FacilityResult;
  /** Its pin is selected on the map beside. */
  selected?: boolean;
  /** Pointer or focus on the row: the map highlights the pin. */
  onActivate?: () => void;
  /** "Show on map" (only when the facility has coordinates). */
  onShowOnMap?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const wait = result.open_now ? waitText(result, t, lang) : "";
  const insurers = insurerNames(result.insurers, t);
  const place = [result.sector, result.district].filter(Boolean).join(", ");
  const join = result.allows_remote_join && result.open_now;
  const book = Boolean(result.next_slot_at);
  return (
    // Pointer and focus only highlight the map pin; the links and buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      aria-labelledby={`place-${result.slug}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      className={cx(
        "grid gap-x-10 gap-y-3 border-b border-border px-5 py-5 last:border-b-0 sm:px-6",
        "@3xl:grid-cols-[minmax(0,1fr)_17.5rem]",
        "transition-colors duration-150 ease-out-quint",
        selected ? "bg-brand-subtle/45" : "hover:bg-page/70",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 id={`place-${result.slug}`} className="m-0 font-heading text-[1.125rem] leading-snug">
          <Link
            to={`/facilities/${result.slug}`}
            viewTransition
            className="text-link no-underline decoration-2 underline-offset-4 hover:underline"
          >
            {result.name}
          </Link>
        </h3>
        <p className="m-0 text-body-sm text-fg-secondary">
          {t(`booking.types.${result.type}`, { defaultValue: result.type })}
          {place && ` · ${place}`}
          {result.distance_km !== null && (
            <span className="font-semibold text-fg tabular-nums">
              {" · "}
              {t("site.home.away", { km: result.distance_km })}
            </span>
          )}
        </p>
        {result.emergency_department && (
          <p className="m-0 inline-flex items-center gap-1.5 text-body-sm font-semibold text-danger">
            <Siren aria-hidden="true" weight="bold" className="size-4" />
            {t("site.emergency.department")}
          </p>
        )}
        <p className="m-0 text-body-sm text-fg-secondary">
          {insurers.length > 0
            ? `${t("site.card.accepted")} ${insurers.join(", ")}`
            : t("site.card.noInsurance")}
        </p>
      </div>

      <div className="flex flex-col gap-1 text-body-sm">
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Status result={result} />
          {wait && <span className="font-semibold text-fg tabular-nums">{wait}</span>}
        </p>
        <p className="m-0 flex flex-wrap items-center gap-x-5">
          {(join || book) && (
            <Link
              to={`/book/${result.slug}`}
              viewTransition
              className="group inline-flex min-h-target items-center gap-1.5 font-semibold text-link no-underline hover:underline"
            >
              {join ? t("booking.facility.join") : t("booking.facility.book")}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5"
              />
            </Link>
          )}
          {onShowOnMap && result.lat !== null && result.lng !== null && (
            <button
              type="button"
              onClick={onShowOnMap}
              aria-label={`${t("site.home.showOnMap")}: ${result.name}`}
              className="inline-flex min-h-target cursor-pointer items-center gap-1.5 text-fg-secondary hover:text-fg hover:underline"
            >
              <MapTrifold aria-hidden="true" className="size-4" />
              {t("site.home.showOnMap")}
            </button>
          )}
        </p>
      </div>
    </li>
  );
}

/** The directory: every place on one surface, hairlines between them, grey rows while loading. */
export function FacilityEntries({
  label,
  rows,
  loading,
  selected,
  onSelect,
  onShowOnMap,
  className,
}: {
  label: string;
  rows: FacilityResult[];
  loading: boolean;
  selected?: string | null;
  onSelect?: (slug: string) => void;
  onShowOnMap?: (slug: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const surface = cx(
    "@container overflow-hidden rounded-lg border border-border bg-surface",
    className,
  );
  if (loading)
    return (
      <div role="status" aria-label={t("site.loading")} className={surface}>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2.5 border-b border-border px-6 py-5 last:border-b-0"
          >
            <Skeleton className="h-5 w-2/5 rounded-sm" />
            <Skeleton className="h-4 w-3/5 rounded-sm" />
            <Skeleton className="h-4 w-1/4 rounded-sm" />
          </div>
        ))}
      </div>
    );
  return (
    <div className={surface}>
      <ul aria-label={label} className="m-0 list-none p-0">
        {rows.map((result) => (
          <FacilityEntry
            key={result.slug}
            result={result}
            selected={selected === result.slug}
            onActivate={onSelect && (() => onSelect(result.slug))}
            onShowOnMap={onShowOnMap && (() => onShowOnMap(result.slug))}
          />
        ))}
      </ul>
    </div>
  );
}

// Leaflet and the tiles load only when the map is on screen (upgrade 03 §2, < 100 KB JS budget)
const FacilityMap = lazy(() => import("@medilink/ui/map"));

/**
 * The directory with its map (home, /facilities): on wide screens the map stays beside the list
 * and each highlights the other; on phones List / Map switch, and "Show on map" opens the pin.
 * Loading, failure and empty states are part of it, so every page shows them the same way.
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
  switchable = false,
}: {
  label: string;
  rows: FacilityResult[];
  loading: boolean;
  /** A new page of results is on its way: the list dims instead of jumping. */
  fetching?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  /** The visitor's position, drawn on the map when shared. */
  near?: { lat: number; lng: number } | null;
  empty: ReactNode;
  /** List / Map switch at every width (home), instead of a map always beside the list. */
  switchable?: boolean;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"list" | "map">("list");
  const besides = !switchable;
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
        className="m-0 flex items-center gap-3 rounded-lg border border-border bg-surface p-5"
      >
        {t("home.failed")}
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {t("home.retry")}
          </Button>
        )}
      </p>
    );
  if (!loading && rows.length === 0)
    return <div className="rounded-lg border border-border bg-surface">{empty}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* phones and tablets: one view at a time */}
      <div
        role="group"
        aria-label={t("home.view.label")}
        className={cx(
          "flex self-start rounded-md border border-border bg-surface p-0.5",
          besides && "lg:hidden",
        )}
      >
        {(["list", "map"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[5px] px-4 text-body-sm font-semibold text-fg-secondary transition-colors duration-150 aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
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
      {/* wide screens: the list beside a map that stays in view */}
      <div
        className={cx(
          "grid items-start gap-6",
          besides &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]",
        )}
      >
        <div
          className={cx(
            "min-w-0 transition-opacity duration-200 ease-out-quint",
            fetching && !loading && "opacity-60",
            view === "map" && (besides ? "hidden lg:block" : "hidden"),
          )}
        >
          <FacilityEntries
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
          className={cx(
            "scroll-mt-24",
            besides && "lg:sticky lg:top-24",
            view === "list" && (besides ? "hidden lg:block" : "hidden"),
          )}
        >
          {inBrowser ? (
            <Suspense fallback={<Skeleton className="h-[28rem] rounded-lg lg:h-[34rem]" />}>
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
            <Skeleton className="h-[28rem] rounded-lg lg:h-[34rem]" />
          )}
        </div>
      </div>
    </div>
  );
}
