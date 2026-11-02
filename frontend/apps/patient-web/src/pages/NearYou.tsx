import { ArrowRight, Crosshair, MapPin, SealCheck } from "@phosphor-icons/react";
import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import { Button, cx, SelectField, Spinner } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../app/services";
import {
  DISTRICT_CODES,
  DISTRICT_KEYS,
  INSURER_CODES,
  type DistrictKey,
} from "../features/booking/discovery";

const SHOWN = 6;

/** Insurer code from the API to the landing label key (S1 insurer codes). */
const INSURER_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(INSURER_CODES)
    .filter(([, code]) => code)
    .map(([key, code]) => [code, key]),
);

type Where = { kind: "near"; lat: number; lng: number } | { kind: "district"; key: DistrictKey };

/**
 * "Care near you" (contract public-pages-and-triage §3, `/`): asks for the location in a card,
 * then shows the nearest verified facilities with the live queue and the insurers they accept.
 * Without a location, a district works the same. The location stays in memory and goes in the
 * POST body only (S5 D-2); it is never stored or put in a URL.
 */
export function NearYou() {
  const { t } = useTranslation();
  const api = useApi();
  const [where, setWhere] = useState<Where | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");

  const body: FacilitySearchInput | null = where
    ? where.kind === "near"
      ? { near: { lat: where.lat, lng: where.lng } }
      : { district_code: DISTRICT_CODES[where.key] }
    : null;
  const results = useQuery({
    queryKey: ["discovery", "near-you", body],
    queryFn: () => api.booking.search(body ?? {}),
    enabled: body !== null,
  });

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setWhere({ kind: "near", lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("denied"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };

  const shown = results.data?.results.slice(0, SHOWN) ?? [];

  return (
    <section aria-labelledby="near-title" className="scroll-mt-4" id="near-you">
      <div className="mx-auto flex max-w-[70rem] flex-col gap-6 px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-xl flex-col gap-2">
            <p className="m-0 text-caption font-semibold tracking-wide text-brand uppercase">
              {t("landing.near.eyebrow")}
            </p>
            <h2 id="near-title" className="m-0 text-h1 tracking-tight">
              {t("landing.near.title")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("landing.near.body")}</p>
          </div>
          {where && (
            <Link to="/search" className="inline-flex items-center gap-1.5 font-semibold">
              {t("landing.near.all")}
              <ArrowRight aria-hidden="true" className="size-icon" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-card sm:flex-row sm:items-end sm:p-6">
          <div className="flex flex-1 items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
              <MapPin aria-hidden="true" weight="duotone" className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="m-0 font-semibold">
                {where?.kind === "near" ? t("landing.near.usingLocation") : t("landing.near.ask")}
              </p>
              <p className="m-0 text-body-sm text-fg-muted">{t("landing.near.private")}</p>
            </div>
          </div>
          <Button
            variant={where?.kind === "near" ? "secondary" : "primary"}
            onClick={locate}
            loading={locating === "busy"}
            iconStart={<Crosshair aria-hidden="true" className="size-icon" />}
          >
            {t("booking.search.useLocation")}
          </Button>
          <SelectField
            id="near-district"
            label={t("landing.near.orDistrict")}
            value={where?.kind === "district" ? where.key : ""}
            onChange={(event) => {
              const key = event.target.value as DistrictKey | "";
              setWhere(key ? { kind: "district", key } : null);
            }}
            className="sm:w-56"
          >
            <option value="">{t("landing.near.chooseDistrict")}</option>
            {DISTRICT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`landing.districts.${key}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {locating === "denied" && (
          <p role="status" className="m-0 text-body-sm text-fg-secondary">
            {t("booking.search.locationDenied")}
          </p>
        )}

        {where && results.isPending && (
          <div className="flex justify-center py-8">
            <Spinner label={t("landing.near.loading")} />
          </div>
        )}
        {where && results.isError && (
          <p role="alert" className="m-0 text-danger">
            {t("booking.search.failed")}
          </p>
        )}
        {where && results.isSuccess && shown.length === 0 && (
          <p className="m-0 rounded-xl bg-surface p-6 text-fg-secondary shadow-card">
            {t("landing.near.none")}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((result) => (
              <li key={result.slug}>
                <NearTile result={result} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NearTile({ result }: { result: FacilityResult }) {
  const { t } = useTranslation();
  const waiting = result.waiting;
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-xl bg-surface p-5 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0 text-h3 leading-snug">
            <Link
              to={`/facilities/${result.slug}`}
              className="text-fg no-underline after:absolute after:inset-0 after:rounded-xl group-hover:underline"
            >
              {result.name}
            </Link>
          </h3>
          <SealCheck
            aria-label={t("booking.verified")}
            weight="fill"
            className="mt-1 size-5 shrink-0 text-brand"
          />
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-body-sm text-fg-muted">
          {result.distance_km !== null && (
            <span className="font-semibold text-fg tabular-nums">
              {t("booking.search.km", { km: result.distance_km })}
            </span>
          )}
          <span>{[result.sector, result.district].filter(Boolean).join(", ")}</span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5">
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 text-body-sm font-semibold whitespace-nowrap",
            result.open_now ? "text-success" : "text-fg-muted",
          )}
        >
          {result.open_now && <span aria-hidden="true" className="ml-live-dot" />}
          {result.open_now ? t("booking.openNow") : t("booking.closedNow")}
        </span>
        {waiting !== null && waiting !== undefined && (
          <span className="text-right text-body-sm text-fg-secondary tabular-nums">
            {waiting === 0
              ? t("booking.facility.queueEmpty")
              : result.wait_range
                ? t("landing.near.wait", {
                    count: waiting,
                    min: result.wait_range.min,
                    max: result.wait_range.max,
                  })
                : t("booking.facility.queueWaiting", { count: waiting })}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <span className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {t("landing.near.insurers")}
        </span>
        {result.insurers.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {result.insurers.map((code) => (
              <li
                key={code}
                className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-caption font-semibold text-on-brand-subtle"
              >
                {INSURER_LABEL[code] ? t(`landing.insurersShort.${INSURER_LABEL[code]}`) : code}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-body-sm text-fg-muted">{t("landing.near.cashOnly")}</span>
        )}
      </div>
    </article>
  );
}
