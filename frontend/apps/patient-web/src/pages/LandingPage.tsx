import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import { Crosshair, MagnifyingGlass, NavigationArrow, Phone, QrCode } from "@phosphor-icons/react";
import { Button, buttonClassName, cx, ImigongoPattern } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../app/services";
import {
  DISTRICT_CODES,
  DISTRICT_KEYS,
  directionsUrl,
  INSURER_CODES,
  INSURER_KEYS,
  SERVICE_CODES,
  type DistrictKey,
  type InsurerKey,
  type ServiceKey,
} from "../features/booking/discovery";
import {
  CHIP,
  FILTER,
  FilterSelect,
  PlacesView,
  sortResults,
  TYPES,
  useNearMe,
  waitText,
  type Sort,
} from "../features/booking/Places";
import { saveChoice, useRecentPlaces, useSavedChoice } from "../features/booking/recent";
import { PublicLayout } from "../layout/PublicLayout";
import { useInstallPrompt } from "../pwa/install";

/** Chips on the deep-forest band: translucent until chosen. */
const ON_FOREST_CHIP =
  "bg-on-forest/10 text-on-forest ring-1 ring-on-forest/20 hover:bg-on-forest/20 aria-pressed:bg-on-forest aria-pressed:text-forest aria-pressed:ring-0";

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

/**
 * Home `/` (upgrade 03 §2): search on top, the live list of places with a map, the nearest
 * emergency departments, services, recent places, alerts, verification and the facility link.
 * Works without an account and without location; the position stays in the browser and goes in
 * the POST body only (S5 D-2).
 */
export function LandingPage() {
  const { t } = useTranslation();
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
  const [sort, setSort] = useState<Sort>("soonest");
  const { near, setNear, locating, locate } = useNearMe(() => setSort("nearest"));

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

  return (
    <PublicLayout>
      <div className="ml-stagger mx-auto flex max-w-[80rem] flex-col gap-8 px-4 py-6 sm:px-6 lg:gap-10 lg:py-10">
        <section
          aria-labelledby="ask"
          className="relative isolate grid gap-8 overflow-hidden rounded-[1.25rem] bg-forest p-5 text-on-forest sm:p-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-10 lg:p-10"
        >
          <ImigongoPattern opacity={0.06} className="-z-10" />
          <div className="flex min-w-0 flex-col gap-5">
            <form onSubmit={onSearch} role="search" className="flex flex-col gap-4">
              <h1 id="ask" className="m-0 text-display leading-tight tracking-tight text-on-forest">
                {t("home.ask")}
              </h1>
              <div className="flex items-center gap-2 rounded-xl border border-transparent bg-surface p-1.5 pl-4 text-fg shadow-raised transition-[border-color,box-shadow] duration-200 ease-out-quint focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]">
                <MagnifyingGlass aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                <input
                  id="ask-input"
                  aria-labelledby="ask"
                  type="search"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("home.placeholder")}
                  maxLength={500}
                  autoComplete="off"
                  className="min-h-12 min-w-0 flex-1 border-0 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
                />
                <Button type="submit" size="lg">
                  {t("home.search")}
                </Button>
              </div>
            </form>
            <ul
              aria-label={t("home.chipsLabel")}
              className="m-0 flex list-none flex-wrap gap-2 p-0"
            >
              {CHIPS.map((chip) => (
                <li key={chip.key}>
                  {chip.service ? (
                    <button
                      type="button"
                      aria-pressed={service === chip.service}
                      onClick={() => pickService(service === chip.service ? "" : chip.service!)}
                      className={cx(CHIP, ON_FOREST_CHIP)}
                    >
                      {t(`home.chips.${chip.key}`)}
                    </button>
                  ) : (
                    <Link to="/check-symptoms" className={cx(CHIP, ON_FOREST_CHIP)}>
                      {t(`home.chips.${chip.key}`)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div
              role="group"
              aria-label={t("care.filters")}
              className="flex flex-wrap items-center gap-2 border-t border-on-forest/15 pt-4"
            >
              <FilterSelect
                id="home-district"
                label={t("home.district")}
                value={near ? "" : district}
                onChange={(value) => {
                  setDistrict(value as DistrictKey | "");
                  setNear(null);
                }}
              >
                <option value="">{near ? t("home.nearYou") : t("home.anyDistrict")}</option>
                {DISTRICT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`landing.districts.${key}`)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                id="home-insurer"
                label={t("home.insurance")}
                value={insurer}
                onChange={(value) => setInsurer(value as InsurerKey | "")}
              >
                <option value="">{t("home.anyInsurance")}</option>
                {INSURER_KEYS.filter((key) => INSURER_CODES[key]).map((key) => (
                  <option key={key} value={key}>
                    {t(`landing.insurersShort.${key}`)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect id="home-type" label={t("home.type")} value={type} onChange={setType}>
                <option value="">{t("home.anyType")}</option>
                {TYPES.map((key) => (
                  <option key={key} value={key}>
                    {t(`booking.types.${key}`)}
                  </option>
                ))}
              </FilterSelect>
              <button
                type="button"
                aria-pressed={openNow}
                onClick={() => setOpenNow((on) => !on)}
                className={FILTER}
              >
                {t("home.openNow")}
              </button>
              <button
                type="button"
                aria-pressed={near !== null}
                onClick={locate}
                disabled={locating === "busy"}
                className={cx(FILTER, "inline-flex items-center gap-1.5 sm:ml-auto")}
              >
                <Crosshair
                  aria-hidden="true"
                  className={cx("size-4", locating === "busy" && "animate-spin")}
                />
                {near ? t("home.nearYou") : t("home.nearMe")}
              </button>
            </div>
            {locating === "denied" && (
              <p role="status" className="m-0 -mt-2 text-body-sm text-on-forest-muted">
                {t("home.locationDenied")}
              </p>
            )}
          </div>
          <TodayStub rows={rows} ready={results.isSuccess} />
        </section>

        <PlacesView
          heading={t("home.places")}
          headingId="places"
          rows={rows}
          state={results.status}
          busy={results.isFetching && !results.isPending}
          onRetry={() => void results.refetch()}
          near={near}
          sort={sort}
          onSort={setSort}
          empty={
            <>
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
            </>
          }
        />

        <EmergencyRow near={near} />

        <section aria-labelledby="by-service" className="flex flex-col gap-3">
          <h2 id="by-service" className="m-0 text-h2">
            {t("home.byService")}
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
            {BY_SERVICE.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    pickService(key);
                    document.getElementById("places")?.scrollIntoView({ block: "start" });
                  }}
                  className="flex min-h-14 w-full cursor-pointer items-center rounded-xl bg-surface px-4 text-left font-semibold text-fg shadow-card transition-[box-shadow,transform] duration-200 ease-out-quint hover:shadow-raised active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  {t(`landing.services.${key}`)}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <RecentPlaces rows={results.data?.results ?? []} />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AlertsBand />
          <VerifyBlock />
          <section
            aria-labelledby="for-facilities"
            className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-surface p-5 shadow-card"
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
      className="flex flex-col gap-3 rounded-2xl bg-danger-bg p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
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
      <ul className="m-0 flex flex-1 list-none flex-col divide-y divide-danger/15 p-0 sm:flex-row sm:flex-wrap sm:divide-x sm:divide-y-0">
        {(hospitals.data ?? []).map((h) => (
          <li key={h.slug} className="flex items-center gap-2 py-1 sm:px-4 sm:py-0 sm:first:pl-0">
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
      className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-surface p-5 shadow-card"
    >
      <h2 id="alerts" className="m-0 text-h3">
        {t("home.alerts")}
      </h2>
      <div className="flex flex-wrap gap-2">
        <Link to="/notifications/settings" className={buttonClassName({ variant: "secondary" })}>
          {t("home.turnOnAlerts")}
        </Link>
        {install && (
          <Button variant="ghost" onClick={install}>
            {t("home.install")}
          </Button>
        )}
      </div>
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
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
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

/**
 * "Right now" ticket stub on the hero (upgrade 02 §1 ticket device): live facts from the list
 * below, never invented (upgrade 01 principle 2). A heartbeat line marks it as care. Before the
 * data arrives (and in the pre-rendered page) the numbers show as dashes.
 */
function TodayStub({ rows, ready }: { rows: FacilityResult[]; ready: boolean }) {
  const { t } = useTranslation();
  const open = rows.filter((r) => r.open_now).length;
  const waiting = rows.reduce((sum, r) => sum + (r.waiting ?? 0), 0);
  const shortest = rows
    .filter((r) => r.open_now && r.wait_range)
    .sort((a, b) => a.wait_range!.max - b.wait_range!.max)[0];
  const value = (n: number) => (ready ? String(n) : "–");
  return (
    <aside
      aria-labelledby="today-stub"
      className="relative hidden animate-rise flex-col gap-4 rounded-2xl bg-surface p-5 text-fg shadow-raised [animation-delay:120ms] sm:flex"
    >
      {/* the ticket notches */}
      <span
        aria-hidden="true"
        className="absolute top-[5.25rem] -left-2.5 size-5 rounded-full bg-forest"
      />
      <span
        aria-hidden="true"
        className="absolute top-[5.25rem] -right-2.5 size-5 rounded-full bg-forest"
      />
      <div className="flex items-center justify-between">
        <h2
          id="today-stub"
          className="m-0 flex items-center gap-2 text-body-sm font-semibold text-fg-secondary"
        >
          <span aria-hidden="true" className="ml-live-dot text-success" />
          {t("home.now.title")}
        </h2>
        <svg
          aria-hidden="true"
          viewBox="0 0 96 24"
          className="h-6 w-24 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M0 12h30l5-8 7 16 6-12 4 4h44" />
        </svg>
      </div>
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-heading text-[3rem] leading-none font-bold tracking-tight tabular-nums">
          {value(open)}
        </span>
        <span className="text-fg-secondary">{t("home.now.open")}</span>
      </p>
      <div aria-hidden="true" className="-mx-5 border-t border-dashed border-border" />
      <dl className="m-0 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-caption text-fg-muted">{t("home.now.waiting")}</dt>
          <dd className="m-0 font-heading text-h2 font-bold tabular-nums">{value(waiting)}</dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">{t("home.now.shortest")}</dt>
          <dd className="m-0 font-heading text-h2 font-bold text-attention tabular-nums">
            {shortest ? t("home.now.minutes", { max: shortest.wait_range!.max }) : "–"}
          </dd>
        </div>
      </dl>
      {shortest && (
        <Link
          to={`/facilities/${shortest.slug}`}
          className="truncate text-body-sm font-semibold text-link"
        >
          {shortest.name}
        </Link>
      )}
    </aside>
  );
}
