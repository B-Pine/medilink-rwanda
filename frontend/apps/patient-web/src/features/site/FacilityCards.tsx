import type { FacilityResult } from "@medilink/api-client";
import {
  Buildings,
  FirstAidKit,
  Hospital,
  MapPin,
  MapTrifold,
  NavigationArrow,
  ShieldCheck,
  Siren,
  SquaresFour,
  Stethoscope,
  type Icon,
} from "@phosphor-icons/react";
import { Button, buttonClassName, cx, Skeleton, type MapPoint } from "@medilink/ui";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { pinKind } from "../booking/discovery";
import { env } from "../../env";
import { insurerNames, MapCard, useWide, waitText } from "../booking/Places";

const KIND_ICON: Record<ReturnType<typeof pinKind>, Icon> = {
  post: FirstAidKit,
  centre: Buildings,
  hospital: Hospital,
  clinic: Stethoscope,
};

/** How many insurer chips a card shows before "+N". */
const INSURERS_SHOWN = 3;

/** Open, busy or closed: a tinted tag with a word, never colour alone. */
function StatusTag({ result, wait }: { result: FacilityResult; wait: string }) {
  const { t } = useTranslation();
  const busy = result.open_now && result.queue_load === "high";
  const tone = !result.open_now
    ? "bg-subtle text-fg"
    : busy
      ? "bg-attention-bg text-attention"
      : "bg-brand-subtle text-on-brand-subtle";
  const word = !result.open_now
    ? t("site.card.closed")
    : busy
      ? t("site.card.busy")
      : t("site.card.open");
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-semibold tabular-nums",
        tone,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-2 rounded-full",
          !result.open_now ? "bg-fg-muted" : busy ? "bg-attention-solid" : "bg-primary",
        )}
      />
      {result.open_now && wait ? `${word} · ${wait}` : word}
    </span>
  );
}

/**
 * One facility as a card (redesign "clinical calm"): an image header (illustrated per type until
 * the facility adds a photo), the type, the name and place, status and wait in words, distance,
 * accepted insurance on one line, and one action that fits the place. Equal height open or closed.
 * No prices (U-01).
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
  const kind = pinKind(result.type);
  const KindIcon = KIND_ICON[kind];
  const wait = waitText(result, t, lang);
  const insurers = insurerNames(result.insurers, t);
  const place = [result.sector, result.district].filter(Boolean).join(", ");
  const join = result.allows_remote_join && result.open_now;
  const book = Boolean(result.next_slot_at);
  return (
    // Pointer and focus only highlight the map pin; the links and buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      aria-labelledby={`card-${result.slug}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      className={cx(
        "ml-lift group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface hover:border-primary/40",
        selected && "border-primary shadow-[0_0_0_1px_var(--color-primary)]",
      )}
    >
      {/* a plain header row: the facility's mark, its type, and the emergency badge when declared */}
      <div aria-hidden="true" className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-subtle text-body-sm font-bold text-primary">
          <KindIcon weight="bold" className="size-4" />
        </span>
        <span className="text-caption font-semibold tracking-wide text-fg-secondary uppercase">
          {t(`booking.types.${result.type}`, { defaultValue: result.type })}
        </span>
        {result.emergency_department && (
          <span className="ml-auto inline-flex items-center gap-1 text-caption font-semibold text-danger">
            <Siren weight="bold" className="size-3.5" />
            {t("site.emergency.department")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-0.5">
          <h3 id={`card-${result.slug}`} className="m-0 text-h3 leading-snug">
            <Link
              to={`/facilities/${result.slug}`}
              viewTransition
              className="inline-flex min-h-target items-center text-fg no-underline after:absolute after:inset-0 after:content-[''] hover:text-primary"
            >
              {result.name}
            </Link>
          </h3>
          <p className="m-0 inline-flex items-center gap-1.5 text-body-sm text-fg-secondary">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {place || t(`booking.types.${result.type}`, { defaultValue: result.type })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusTag result={result} wait={wait} />
          {result.distance_km !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-body-sm font-semibold text-fg tabular-nums">
              <NavigationArrow aria-hidden="true" weight="fill" className="size-3.5" />
              {t("site.home.away", { km: result.distance_km })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-body-sm">
          {insurers.length > 0 ? (
            <>
              <span className="sr-only">{t("site.card.accepted")}</span>
              <ShieldCheck aria-hidden="true" weight="bold" className="size-4 text-primary" />
              {insurers.slice(0, INSURERS_SHOWN).map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-border px-2 py-0.5 text-caption font-semibold text-fg"
                >
                  {name}
                </span>
              ))}
              {insurers.length > INSURERS_SHOWN && (
                <span className="text-caption font-semibold text-fg-secondary">
                  +{insurers.length - INSURERS_SHOWN}
                </span>
              )}
            </>
          ) : (
            <span className="text-fg-secondary">{t("site.card.noInsurance")}</span>
          )}
        </div>

        {/* the controls sit above the card-wide name link (relative z-10) */}
        <div className="relative z-10 mt-auto flex items-center gap-2 border-t border-border/60 pt-4">
          {join || book ? (
            <Link
              to={`/book/${result.slug}`}
              viewTransition
              className={buttonClassName({ pill: true, className: "flex-1" })}
            >
              {join ? t("home.join") : t("home.book")}
            </Link>
          ) : null}
          <Link
            to={`/facilities/${result.slug}`}
            viewTransition
            aria-label={`${t("site.card.details")}: ${result.name}`}
            className={buttonClassName({
              variant: "secondary",
              pill: true,
              className: join || book ? undefined : "flex-1",
            })}
          >
            {t("site.card.details")}
          </Link>
          {onShowOnMap && result.lat !== null && result.lng !== null && (
            <button
              type="button"
              onClick={onShowOnMap}
              aria-label={t("site.home.showOnMap")}
              title={t("site.home.showOnMap")}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-link transition-colors duration-150 hover:border-primary hover:bg-brand-subtle"
            >
              <MapTrifold aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
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
  wide = false,
  stack = false,
}: {
  label: string;
  rows: FacilityResult[];
  loading: boolean;
  selected?: string | null;
  onSelect?: (slug: string) => void;
  onShowOnMap?: (slug: string) => void;
  /** Beside a filter column and a map: one card per row until the screen is very wide. */
  compact?: boolean;
  /** No map beside: three cards a row on wide screens. */
  wide?: boolean;
  /** In a narrow panel: always one card per row. */
  stack?: boolean;
}) {
  const cols = stack
    ? ""
    : compact
      ? "sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"
      : wide
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";
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
  switchable = false,
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
  /** List / Map switch at every width (home), instead of a map always beside the cards. */
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
        className="m-0 flex items-center gap-3 rounded-2xl bg-surface p-5 shadow-card"
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
    return <div className="rounded-3xl bg-surface shadow-card">{empty}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* phones and tablets: one view at a time */}
      <div
        role="group"
        aria-label={t("home.view.label")}
        className={cx("flex self-start rounded-full bg-subtle p-1", besides && "lg:hidden")}
      >
        {(["list", "map"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
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
      <div
        className={cx(
          "grid items-start gap-6",
          besides &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]",
        )}
      >
        <div
          className={cx(
            "min-w-0 transition-opacity duration-200 ease-out-quint",
            fetching && !loading && "opacity-60",
            view === "map" && (besides ? "hidden lg:block" : "hidden"),
          )}
        >
          <FacilityCardGrid
            label={label}
            rows={rows}
            loading={loading}
            wide={switchable}
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
