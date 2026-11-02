import type { TFunction } from "i18next";
import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import {
  Crosshair,
  List as ListIcon,
  MagnifyingGlass,
  MapTrifold,
  NavigationArrow,
  Phone,
  QrCode,
} from "@phosphor-icons/react";
import {
  Button,
  buttonClassName,
  cx,
  FacilityList,
  FacilityRow,
  type MapPoint,
  SelectField,
  Skeleton,
} from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../app/services";
import { env } from "../env";
import {
  DISTRICT_CODES,
  DISTRICT_KEYS,
  directionsUrl,
  INSURER_CODES,
  INSURER_KEYS,
  pinKind,
  SERVICE_CODES,
  time,
  type DistrictKey,
  type InsurerKey,
  type ServiceKey,
} from "../features/booking/discovery";
import { saveChoice, useRecentPlaces, useSavedChoice } from "../features/booking/recent";
import { PublicLayout } from "../layout/PublicLayout";
import { useInstallPrompt } from "../pwa/install";

// Leaflet and the tiles load only when the map is on screen (upgrade 03 §2, < 100 KB JS budget)
const FacilityMap = lazy(() => import("@medilink/ui/map"));

/** Chips under the search field, for people who don't type (upgrade 03 §2). */
const CHIPS: { key: string; service?: ServiceKey }[] = [
  { key: "sick", service: "general" },
  { key: "child", service: "pediatrics" },
  { key: "pregnancy", service: "antenatal" },
  { key: "teeth", service: "dental" },
  { key: "eyes", service: "eye" },
  { key: "chronic", service: "chronic" },
  { key: "unsure" },
];

const BY_SERVICE: ServiceKey[] = [
  "pediatrics",
  "antenatal",
  "dental",
  "eye",
  "women",
  "chronic",
  "vaccination",
  "general",
];

const TYPES = [
  "health_center",
  "district_hospital",
  "referral_hospital",
  "private_clinic",
  "polyclinic",
  "health_post",
];

type Sort = "soonest" | "nearest" | "name";

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

function sortResults(results: FacilityResult[], sort: Sort): FacilityResult[] {
  const copy = [...results];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "nearest")
    return copy.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  return copy.sort(
    (a, b) => soonest(a) - soonest(b) || (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
  );
}

/**
 * Home `/` (upgrade 03 §2): search on top, the live list of places with a map, the nearest
 * emergency departments, services, recent places, alerts, verification and the facility link.
 * Works without an account and without location; the position stays in the browser and goes in
 * the POST body only (S5 D-2).
 */
export function LandingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [service, setService] = useState<ServiceKey | "">("");
  // Device choices apply after hydration (the pre-rendered page hydrates unchanged); a pick on this
  // page overrides them and is remembered.
  const saved = useSavedChoice();
  const [districtPick, setDistrictPick] = useState<DistrictKey | "" | null>(null);
  const [insurerPick, setInsurerPick] = useState<InsurerKey | "" | null>(null);
  const district: DistrictKey | "" =
    districtPick ??
    (saved.district && saved.district in DISTRICT_CODES ? (saved.district as DistrictKey) : "");
  const insurer: InsurerKey | "" =
    insurerPick ??
    (saved.insurer && saved.insurer in INSURER_CODES ? (saved.insurer as InsurerKey) : "");
  const setDistrict = (value: DistrictKey | "") => {
    setDistrictPick(value);
    saveChoice({ district: value, insurer });
  };
  const setInsurer = (value: InsurerKey | "") => {
    setInsurerPick(value);
    saveChoice({ district, insurer: value });
  };
  const [openNow, setOpenNow] = useState(false);
  const [type, setType] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<Sort>("soonest");
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useWide();

  const body: FacilitySearchInput = {
    service_code: service ? SERVICE_CODES[service] : undefined,
    district_code: near ? undefined : district ? DISTRICT_CODES[district] : undefined,
    insurer_code: insurer ? INSURER_CODES[insurer] || undefined : undefined,
    open_now: openNow || undefined,
    near,
  };
  const results = useQuery({
    queryKey: ["discovery", "home", body],
    queryFn: () => api.booking.search(body),
  });
  const rows = useMemo(() => {
    const all = results.data?.results ?? [];
    return sortResults(type ? all.filter((r) => r.type === type) : all, sort);
  }, [results.data, type, sort]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setSort("nearest");
        setLocating("idle");
      },
      () => setLocating("denied"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = text.trim().toLowerCase();
    if (!query) return;
    // A service name filters the list; anything else is a symptom for the checker.
    const match = (Object.keys(SERVICE_CODES) as ServiceKey[]).find((key) =>
      t(`home.keywords.${key}`)
        .split("|")
        .some((word) => word && query.includes(word)),
    );
    if (match) {
      setService(match);
      document.getElementById("places")?.scrollIntoView({ block: "start" });
    } else void navigate(`/check-symptoms?q=${encodeURIComponent(text.trim())}`);
  };

  const pickService = (key: ServiceKey | "") => {
    setService(key);
    setText("");
  };

  const showMap = wide || view === "map";
  const points: MapPoint[] = rows
    .filter((r) => r.lat !== null && r.lng !== null)
    .map((r) => ({
      id: r.slug,
      lat: r.lat!,
      lng: r.lng!,
      kind: pinKind(r.type),
      load: r.queue_load,
      label: `${r.name}, ${waitText(r, t, lang)}`,
    }));
  const chosen = rows.find((r) => r.slug === selected);

  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-[80rem] flex-col gap-10 px-4 py-6 sm:px-6 lg:py-8">
        <section aria-labelledby="ask" className="flex flex-col gap-3">
          <form onSubmit={onSearch} role="search" className="flex flex-col gap-3">
            <h1 id="ask" className="m-0 text-h1">
              {t("home.ask")}
            </h1>
            <div className="flex gap-2">
              <input
                id="ask-input"
                aria-labelledby="ask"
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("home.placeholder")}
                maxLength={500}
                autoComplete="off"
                className="min-h-[3.5rem] min-w-0 flex-1 rounded-md border border-border-input bg-surface px-4 text-body text-fg placeholder:text-fg-muted"
              />
              <Button
                type="submit"
                size="lg"
                iconStart={<MagnifyingGlass aria-hidden="true" className="size-icon" />}
              >
                {t("home.search")}
              </Button>
            </div>
          </form>
          <ul aria-label={t("home.chipsLabel")} className="m-0 flex list-none flex-wrap gap-2 p-0">
            {CHIPS.map((chip) => (
              <li key={chip.key}>
                {chip.service ? (
                  <button
                    type="button"
                    aria-pressed={service === chip.service}
                    onClick={() => pickService(service === chip.service ? "" : chip.service!)}
                    className="inline-flex min-h-target cursor-pointer items-center rounded-full bg-subtle px-4 text-body-sm font-semibold text-fg hover:bg-brand-subtle aria-pressed:bg-primary aria-pressed:text-on-primary"
                  >
                    {t(`home.chips.${chip.key}`)}
                  </button>
                ) : (
                  <Link
                    to="/check-symptoms"
                    className="inline-flex min-h-target items-center rounded-full bg-subtle px-4 text-body-sm font-semibold text-fg no-underline hover:bg-brand-subtle"
                  >
                    {t(`home.chips.${chip.key}`)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              id="home-district"
              label={t("home.district")}
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value as DistrictKey | "");
                setNear(null);
              }}
              className="w-44"
            >
              <option value="">{t("home.anyDistrict")}</option>
              {DISTRICT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`landing.districts.${key}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="home-insurer"
              label={t("home.insurance")}
              value={insurer}
              onChange={(event) => setInsurer(event.target.value as InsurerKey | "")}
              className="w-48"
            >
              <option value="">{t("home.anyInsurance")}</option>
              {INSURER_KEYS.filter((key) => INSURER_CODES[key]).map((key) => (
                <option key={key} value={key}>
                  {t(`landing.insurersShort.${key}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="home-type"
              label={t("home.type")}
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-48"
            >
              <option value="">{t("home.anyType")}</option>
              {TYPES.map((key) => (
                <option key={key} value={key}>
                  {t(`booking.types.${key}`)}
                </option>
              ))}
            </SelectField>
            <button
              type="button"
              aria-pressed={openNow}
              onClick={() => setOpenNow((on) => !on)}
              className="inline-flex min-h-target cursor-pointer items-center rounded-md border border-border-input bg-surface px-4 font-semibold text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {t("home.openNow")}
            </button>
            <Button
              variant="secondary"
              onClick={locate}
              loading={locating === "busy"}
              aria-pressed={near !== null}
              iconStart={<Crosshair aria-hidden="true" className="size-icon" />}
              className="ml-auto"
            >
              {near ? t("home.nearYou") : t("home.nearMe")}
            </Button>
          </div>
          {locating === "denied" && (
            <p role="status" className="m-0 text-body-sm text-fg-secondary">
              {t("home.locationDenied")}
            </p>
          )}
        </section>

        <section aria-labelledby="places" className="flex scroll-mt-4 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="places" className="m-0 text-h2">
              {t("home.places")}
            </h2>
            {results.isSuccess && (
              <span role="status" className="text-body-sm text-fg-muted tabular-nums">
                {t("home.count", { count: rows.length })}
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-2 text-body-sm text-fg-secondary">
                {t("home.sort.label")}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
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
                className="flex rounded-md bg-subtle p-0.5 lg:hidden"
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

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
            <div
              className={cx(
                "min-w-0 rounded-lg bg-surface shadow-card",
                !wide && view === "map" && "hidden",
              )}
            >
              {results.isPending ? (
                <div className="flex flex-col gap-3 p-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : results.isError ? (
                <p role="alert" className="m-0 flex items-center gap-3 p-4">
                  {t("home.failed")}
                  <Button variant="secondary" size="sm" onClick={() => void results.refetch()}>
                    {t("home.retry")}
                  </Button>
                </p>
              ) : rows.length === 0 ? (
                <p className="m-0 flex flex-wrap items-center gap-3 p-4 text-fg-secondary">
                  {t("home.empty")}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      pickService("");
                      setType("");
                      setOpenNow(false);
                      setDistrict("");
                    }}
                  >
                    {t("home.clear")}
                  </Button>
                </p>
              ) : (
                <FacilityList
                  labels={{
                    list: t("home.places"),
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
                          to={`/facilities/${r.slug}`}
                          className="text-fg no-underline hover:underline"
                        >
                          {r.name}
                        </Link>
                      }
                      type={t(`booking.types.${r.type}`, { defaultValue: r.type })}
                      distance={
                        r.distance_km !== null
                          ? t("booking.search.km", { km: r.distance_km })
                          : null
                      }
                      open={{
                        isOpen: r.open_now,
                        label: r.open_now ? t("home.open") : t("home.closed"),
                      }}
                      wait={{
                        text: waitText(r, t, lang),
                        tone: r.queue_load,
                      }}
                      insurers={insurerNames(r.insurers, t)}
                      selected={selected === r.slug}
                      onActivate={() => setSelected(r.slug)}
                      actions={<RowActions result={r} />}
                    />
                  ))}
                </FacilityList>
              )}
            </div>
            {showMap && (
              <Suspense fallback={<Skeleton className="h-[28rem] lg:h-full" />}>
                <FacilityMap
                  points={points}
                  selectedId={selected}
                  onSelect={setSelected}
                  you={near}
                  tilesUrl={env.mapTilesUrl}
                  attribution={t("home.mapAttribution")}
                  label={t("home.mapLabel")}
                  className="h-[28rem] lg:sticky lg:top-4 lg:h-[36rem]"
                  card={chosen ? <MapCard result={chosen} /> : undefined}
                />
              </Suspense>
            )}
          </div>
        </section>

        <EmergencyRow near={near} />

        <section aria-labelledby="by-service" className="flex flex-col gap-3">
          <h2 id="by-service" className="m-0 text-h2">
            {t("home.byService")}
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {BY_SERVICE.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    pickService(key);
                    document.getElementById("places")?.scrollIntoView({ block: "start" });
                  }}
                  className="inline-flex min-h-target cursor-pointer items-center rounded-md bg-surface px-4 font-semibold text-fg shadow-card hover:bg-subtle"
                >
                  {t(`landing.services.${key}`)}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <RecentPlaces rows={results.data?.results ?? []} />

        <AlertsBand />

        <div className="grid gap-4 md:grid-cols-2">
          <VerifyBlock />
          <section
            aria-labelledby="for-facilities"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-5 shadow-card"
          >
            <h2 id="for-facilities" className="m-0 text-h3">
              {t("home.forFacilities")}
            </h2>
            <Link to="/for-facilities" className={buttonClassName({ variant: "secondary" })}>
              {t("home.register")}
            </Link>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}

type T = TFunction;

function insurerNames(codes: string[], t: T): string[] {
  return codes.map((code) =>
    INSURER_KEY_BY_CODE[code] ? t(`landing.insurersShort.${INSURER_KEY_BY_CODE[code]}`) : code,
  );
}

function waitText(r: FacilityResult, t: T, lang: string): string {
  if (r.waiting !== null && r.waiting !== undefined) {
    if (r.waiting === 0) return t("home.noWait");
    if (r.wait_range)
      return t("home.wait", { count: r.waiting, min: r.wait_range.min, max: r.wait_range.max });
    return t("home.waiting", { count: r.waiting });
  }
  if (r.next_slot_at) return t("home.next", { time: time(r.next_slot_at, lang) });
  return "";
}

function RowActions({ result }: { result: FacilityResult }) {
  const { t } = useTranslation();
  const join = result.allows_remote_join;
  return (
    <>
      {(join || result.next_slot_at) && (
        <Link to={`/book/${result.slug}`} className={buttonClassName({ size: "sm" })}>
          {join ? t("home.join") : t("home.book")}
        </Link>
      )}
      <Link
        to={`/facilities/${result.slug}`}
        className={buttonClassName({ variant: "ghost", size: "sm" })}
      >
        {t("home.viewLink")}
      </Link>
    </>
  );
}

function MapCard({ result }: { result: FacilityResult }) {
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

/**
 * Nearest emergency departments, always shown (upgrade 03 §2). Interim rule until the listing
 * carries `has_emergency_24h` (03 §12): hospitals, which run a 24-hour emergency department.
 */
function EmergencyRow({ near }: { near: { lat: number; lng: number } | null }) {
  const { t } = useTranslation();
  const api = useApi();
  const hospitals = useQuery({
    queryKey: ["discovery", "emergency", near],
    queryFn: () => api.booking.search({ near }),
    select: (page) => page.results.filter((r) => r.type.endsWith("hospital")).slice(0, 3),
  });
  return (
    <section
      aria-labelledby="emergency-24h"
      className="flex flex-col gap-3 rounded-lg bg-danger-bg p-4 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3 sm:w-56">
        <h2 id="emergency-24h" className="m-0 text-h3 text-danger">
          {t("home.emergency")}
        </h2>
        <a href="tel:912" className={buttonClassName({ variant: "danger", size: "sm" })}>
          <Phone aria-hidden="true" className="size-4" />
          {t("home.call912")}
        </a>
      </div>
      <ul className="m-0 flex flex-1 list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {(hospitals.data ?? []).map((h) => (
          <li key={h.slug} className="flex items-center gap-2">
            <Link to={`/facilities/${h.slug}`} className="font-semibold text-fg">
              {h.name}
            </Link>
            {h.distance_km !== null && (
              <span className="text-body-sm text-fg-secondary tabular-nums">
                {t("booking.search.km", { km: h.distance_km })}
              </span>
            )}
            {h.lat !== null && h.lng !== null && (
              <a
                href={directionsUrl(h.lat, h.lng)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-target items-center gap-1 text-body-sm font-semibold"
              >
                <NavigationArrow aria-hidden="true" className="size-4" />
                {t("home.directions")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentPlaces({ rows }: { rows: FacilityResult[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const places = useRecentPlaces();
  if (!places.length) return null;
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-2">
      <h2 id="recent" className="m-0 text-h3">
        {t("home.recent")}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0">
        {places.map((p) => {
          const live = rows.find((r) => r.slug === p.slug);
          return (
            <li key={p.slug} className="flex items-baseline gap-2">
              <Link to={`/facilities/${p.slug}`} className="font-semibold">
                {p.name}
              </Link>
              {live && (
                <span className="text-body-sm text-fg-secondary tabular-nums">
                  {waitText(live, t, lang)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AlertsBand() {
  const { t } = useTranslation();
  const install = useInstallPrompt();
  return (
    <section
      aria-labelledby="alerts"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-5 shadow-card"
    >
      <h2 id="alerts" className="m-0 mr-auto text-h3">
        {t("home.alerts")}
      </h2>
      {install && (
        <Button variant="secondary" onClick={install}>
          {t("home.install")}
        </Button>
      )}
      <Link to="/notifications/settings" className={buttonClassName({ variant: "secondary" })}>
        {t("home.turnOnAlerts")}
      </Link>
    </section>
  );
}

function VerifyBlock() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <section
      aria-labelledby="verify"
      className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-card"
    >
      <h2 id="verify" className="m-0 text-h3">
        {t("home.verify")}
      </h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) void navigate(`/verify/${encodeURIComponent(code.trim())}`);
        }}
      >
        <label htmlFor="verify-code" className="sr-only">
          {t("home.verifyCode")}
        </label>
        <input
          id="verify-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("home.verifyCode")}
          autoComplete="off"
          className="min-h-target min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 font-mono text-fg uppercase placeholder:font-sans placeholder:normal-case"
        />
        <Button type="submit" variant="secondary">
          {t("home.check")}
        </Button>
        <Link to="/verify" className={buttonClassName({ variant: "ghost" })}>
          <QrCode aria-hidden="true" className="size-icon" />
          {t("home.scan")}
        </Link>
      </form>
    </section>
  );
}

/** Desktop (≥ 1024 px): the map sits beside the list instead of behind a toggle. */
const WIDE = "(min-width: 64rem)";

function subscribeWide(change: () => void): () => void {
  const media = window.matchMedia?.(WIDE);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}

function useWide(): boolean {
  // false while the pre-rendered markup hydrates (it has no map), then the real width
  return useSyncExternalStore(
    subscribeWide,
    () => !!window.matchMedia?.(WIDE).matches,
    () => false,
  );
}
