import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import { Crosshair, MagnifyingGlass, NavigationArrow, Phone, QrCode } from "@phosphor-icons/react";
import { Button, buttonClassName, SelectField } from "@medilink/ui";
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

        <PlacesView
          heading={t("home.places")}
          headingId="places"
          rows={rows}
          state={results.status}
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
