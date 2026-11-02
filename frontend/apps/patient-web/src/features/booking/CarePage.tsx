import type { FacilitySearchInput, LevelOfCare } from "@medilink/api-client";
import { Crosshair, Faders, X } from "@phosphor-icons/react";
import { Button, cx, Dialog, SelectField } from "@medilink/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PublicLayout } from "../../layout/PublicLayout";
import {
  DISTRICT_CODES,
  DISTRICT_KEYS,
  INSURER_CODES,
  INSURER_KEYS,
  SERVICE_CODES,
  SERVICE_KEYS,
  type ServiceKey,
} from "./discovery";
import { FILTER, PlacesView, sortResults, TYPES, useNearMe, type Sort } from "./Places";

const LEVELS: LevelOfCare[] = ["primary", "secondary", "tertiary"];
const DISTANCES = [2, 5, 10, 25] as const;
const AVAILABILITY = ["today", "remote"] as const;
type Availability = (typeof AVAILABILITY)[number];

/**
 * Find care `/care` (upgrade 03 §3): the list and map at full width with every filter in a panel
 * (a dialog on phones). Active filters show as removable chips with "Clear all" and the count.
 * No prices (U-01). Doctor language and gender wait for doctor profiles (U-06).
 */
export function CarePage() {
  const { t } = useTranslation();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<Sort>("soonest");
  const { near, setNear, locating, locate } = useNearMe(() => setSort("nearest"));
  const [panel, setPanel] = useState(false);

  const service = valid(params.get("service"), SERVICE_KEYS);
  const district = valid(params.get("district"), DISTRICT_KEYS);
  const insurer = valid(params.get("insurer"), INSURER_KEYS);
  const type = valid(params.get("type"), TYPES);
  const level = valid(params.get("level"), LEVELS);
  const openNow = params.get("open") === "1";
  const today = params.get("today") === "1";
  const remote = params.get("remote") === "1";
  const km = Number(params.get("km")) || 0;

  // Choices live in the URL so a search can be shared; never the location (S5 D-2).
  const set = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const clearAll = () => {
    setParams(new URLSearchParams(), { replace: true });
    setNear(null);
  };

  const body: FacilitySearchInput = {
    service_code: service ? SERVICE_CODES[service] : undefined,
    district_code: near ? undefined : district ? DISTRICT_CODES[district] : undefined,
    insurer_code: insurer ? INSURER_CODES[insurer] || undefined : undefined,
    open_now: openNow || undefined,
    level_of_care: level || undefined,
    available_today: today || undefined,
    near,
  };
  const results = useQuery({
    queryKey: ["discovery", "care", body],
    queryFn: () => api.booking.search(body),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => {
    const all = (results.data?.results ?? []).filter(
      (r) =>
        (!type || r.type === type) &&
        (!remote || r.allows_remote_join) &&
        (!km || !near || (r.distance_km !== null && r.distance_km <= km)),
    );
    return sortResults(all, sort);
  }, [results.data, type, remote, km, near, sort]);

  const chips: { key: string; label: string; remove: () => void }[] = [
    service && { key: "service", label: t(`landing.services.${service}`) },
    district && !near && { key: "district", label: t(`landing.districts.${district}`) },
    insurer && { key: "insurer", label: t(`landing.insurersShort.${insurer}`) },
    type && { key: "type", label: t(`booking.types.${type}`) },
    level && { key: "level", label: t(`care.levels.${level}`) },
    openNow && { key: "open", label: t("home.openNow") },
    today && { key: "today", label: t("care.availability.today") },
    remote && { key: "remote", label: t("care.availability.remote") },
    km > 0 && near && { key: "km", label: t("care.withinKm", { km }) },
  ]
    .filter((chip): chip is { key: string; label: string } => Boolean(chip))
    .map((chip) => ({ ...chip, remove: () => set(chip.key, "") }));
  if (near) chips.push({ key: "near", label: t("home.nearYou"), remove: () => setNear(null) });

  const filters = (
    <div className="flex flex-col gap-4">
      <SelectField
        id="care-service"
        label={t("care.service")}
        value={service}
        onChange={(event) => set("service", event.target.value)}
      >
        <option value="">{t("care.anyService")}</option>
        {SERVICE_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(`landing.services.${key}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="care-insurer"
        label={t("home.insurance")}
        value={insurer}
        onChange={(event) => set("insurer", event.target.value)}
      >
        <option value="">{t("home.anyInsurance")}</option>
        {INSURER_KEYS.filter((key) => INSURER_CODES[key]).map((key) => (
          <option key={key} value={key}>
            {t(`landing.insurersShort.${key}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="care-district"
        label={t("home.district")}
        value={near ? "" : district}
        disabled={near !== null}
        onChange={(event) => set("district", event.target.value)}
      >
        <option value="">{near ? t("home.nearYou") : t("home.anyDistrict")}</option>
        {DISTRICT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(`landing.districts.${key}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="care-type"
        label={t("home.type")}
        value={type}
        onChange={(event) => set("type", event.target.value)}
      >
        <option value="">{t("home.anyType")}</option>
        {TYPES.map((key) => (
          <option key={key} value={key}>
            {t(`booking.types.${key}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="care-level"
        label={t("care.level")}
        value={level}
        onChange={(event) => set("level", event.target.value)}
      >
        <option value="">{t("care.anyLevel")}</option>
        {LEVELS.map((key) => (
          <option key={key} value={key}>
            {t(`care.levels.${key}`)}
          </option>
        ))}
      </SelectField>
      {level && level !== "primary" && insurer === "mutuelle" && (
        <p className="m-0 text-body-sm text-fg-secondary">{t("care.transferHint")}</p>
      )}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 font-semibold">{t("care.when")}</legend>
        <Toggle on={openNow} onChange={(on) => set("open", on ? "1" : "")}>
          {t("home.openNow")}
        </Toggle>
        {AVAILABILITY.map((key: Availability) => (
          <Toggle
            key={key}
            on={key === "today" ? today : remote}
            onChange={(on) => set(key, on ? "1" : "")}
          >
            {t(`care.availability.${key}`)}
          </Toggle>
        ))}
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 font-semibold">{t("care.distance")}</legend>
        {near ? (
          <div className="flex flex-wrap gap-2">
            {DISTANCES.map((value) => (
              <Toggle
                key={value}
                on={km === value}
                onChange={(on) => set("km", on ? String(value) : "")}
              >
                {t("care.km", { km: value })}
              </Toggle>
            ))}
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={locate}
            loading={locating === "busy"}
            iconStart={<Crosshair aria-hidden="true" className="size-icon" />}
          >
            {t("home.nearMe")}
          </Button>
        )}
        {locating === "denied" && (
          <p role="status" className="m-0 text-body-sm text-fg-secondary">
            {t("home.locationDenied")}
          </p>
        )}
      </fieldset>
    </div>
  );

  return (
    <PublicLayout>
      <div className="ml-stagger mx-auto grid max-w-[80rem] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 lg:py-10">
        <aside
          aria-labelledby="filters"
          className="hidden self-start rounded-3xl bg-surface p-6 shadow-card lg:sticky lg:top-4 lg:block"
        >
          <h2 id="filters" className="mt-0 mb-4 text-h3">
            {t("care.filters")}
          </h2>
          {filters}
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          {chips.length > 0 && (
            <ul
              aria-label={t("care.active")}
              className="m-0 flex list-none flex-wrap items-center gap-2 p-0"
            >
              {chips.map((chip) => (
                <li key={chip.key} className="animate-enter">
                  <button
                    type="button"
                    onClick={chip.remove}
                    aria-label={t("care.remove", { label: chip.label })}
                    className="inline-flex min-h-target cursor-pointer items-center gap-1.5 rounded-full bg-brand-subtle px-3 text-body-sm font-semibold text-on-brand-subtle transition-[background-color,transform] duration-150 ease-out-quint hover:bg-subtle active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    {chip.label}
                    <X aria-hidden="true" weight="bold" className="size-4" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex min-h-target cursor-pointer items-center px-2 text-body-sm font-semibold text-link"
                >
                  {t("care.clearAll")}
                </button>
              </li>
            </ul>
          )}
          <PlacesView
            heading={t("care.title")}
            headingId="care-title"
            headingLevel={1}
            rows={rows}
            state={results.status}
            busy={results.isPlaceholderData}
            onRetry={() => void results.refetch()}
            near={near}
            sort={sort}
            onSort={setSort}
            toolbar={
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                onClick={() => setPanel(true)}
                iconStart={<Faders aria-hidden="true" className="size-4" />}
              >
                {chips.length ? t("care.filtersCount", { count: chips.length }) : t("care.filters")}
              </Button>
            }
            empty={<NoMatch service={service} onClear={clearAll} />}
          />
        </div>
      </div>

      <Dialog
        open={panel}
        onOpenChange={setPanel}
        title={t("care.filters")}
        closeLabel={t("care.close")}
        footer={
          <Button fullWidth onClick={() => setPanel(false)}>
            {t("care.show", { count: rows.length })}
          </Button>
        }
      >
        {filters}
      </Dialog>
    </PublicLayout>
  );
}

function valid<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function Toggle({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cx(FILTER, "inline-flex items-center text-left")}
    >
      {children}
    </button>
  );
}

/**
 * No results: one line with the reason and, when a service was chosen, the nearest health centre
 * offering it (upgrade 03 §3).
 */
function NoMatch({ service, onClear }: { service: ServiceKey | ""; onClear: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const fallback = useQuery({
    queryKey: ["discovery", "care-fallback", service],
    queryFn: () => api.booking.search({ service_code: SERVICE_CODES[service as ServiceKey] }),
    enabled: service !== "",
    select: (page) => page.results.find((r) => r.type === "health_center") ?? page.results[0],
  });
  return (
    <>
      <span>{t("care.none")}</span>
      {fallback.data && (
        <Link to={`/facilities/${fallback.data.slug}`} className="font-semibold">
          {t("care.tryInstead", { name: fallback.data.name })}
        </Link>
      )}
      <Button variant="secondary" size="sm" onClick={onClear}>
        {t("care.clearAll")}
      </Button>
    </>
  );
}
