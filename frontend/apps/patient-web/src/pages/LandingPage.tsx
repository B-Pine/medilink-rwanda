import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import { ArrowRight, Crosshair, MagnifyingGlass } from "@phosphor-icons/react";
import { Button, buttonClassName, cx, Skeleton } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../app/services";
import { PageHeading } from "../components/PageHeading";
import {
  DISTRICT_CODES,
  SERVICE_CODES,
  type DistrictKey,
  type ServiceKey,
} from "../features/booking/discovery";
import {
  FILTER,
  insurerNames,
  sortResults,
  useNearMe,
  waitText,
  type Sort,
} from "../features/booking/Places";
import { useAllFacilities } from "../features/site/data";
import { LocationSelector, PageContainer, SearchBar } from "../features/site/kit";
import { PublicLayout } from "../layout/PublicLayout";

const COMMON_NEEDS: { key: string; to: string }[] = [
  { key: "general", to: "/find-care?service=general" },
  { key: "maternal", to: "/find-care?service=antenatal" },
  { key: "lab", to: "/find-care?q=lab" },
  { key: "dental", to: "/find-care?service=dental" },
];

const CARE: ServiceKey[] = ["general", "antenatal", "pediatrics", "dental", "eye", "vaccination"];

const STEPS = ["search", "join", "arrive"] as const;

/** How many places the live list beside the search shows. */
const LIVE_ROWS = 5;

/** One place in the live list: name and where on the left, open or closed and the wait on the right. */
function LiveRow({ result }: { result: FacilityResult }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const busy = result.open_now && result.queue_load === "high";
  const wait = result.open_now ? waitText(result, t, lang) : "";
  const insurers = insurerNames(result.insurers, t);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 border-b border-border px-5 py-3.5 last:border-b-0">
      <h3 className="m-0 min-w-0 font-sans text-body font-semibold tracking-normal break-words">
        <Link
          to={`/facilities/${result.slug}`}
          viewTransition
          className="text-link no-underline hover:underline"
        >
          {result.name}
        </Link>
      </h3>
      <span
        className={cx(
          "inline-flex items-center gap-1.5 justify-self-end text-body-sm font-semibold whitespace-nowrap",
          !result.open_now ? "text-fg-secondary" : busy ? "text-attention" : "text-success",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "size-2 rounded-full",
            !result.open_now
              ? "border border-fg-muted"
              : busy
                ? "bg-attention-solid"
                : "bg-success",
          )}
        />
        {!result.open_now
          ? t("site.card.closed")
          : busy
            ? t("site.card.busy")
            : t("site.card.open")}
      </span>
      <span className="min-w-0 text-body-sm text-fg-secondary">
        {t(`booking.types.${result.type}`, { defaultValue: result.type })}
        {result.district && ` · ${result.district}`}
        {result.distance_km !== null && ` · ${t("site.home.away", { km: result.distance_km })}`}
      </span>
      <span className="justify-self-end text-body-sm text-fg tabular-nums">{wait}</span>
      {insurers.length > 0 && (
        <span className="col-span-2 text-body-sm text-fg-secondary">
          {`${t("site.card.accepted")} ${insurers.join(", ")}`}
        </span>
      )}
    </li>
  );
}

/**
 * Home `/` (public design brief 2026-11-04): a public service, not a campaign. The first view
 * holds the question and the answer: a plain heading, one search and the common needs on the
 * left; on the right the places open near the visitor, live, as the proof. Below, the services
 * as an index, the three steps in words, and one line for facilities. No illustration, no phone
 * mock-ups, no invented numbers. Works without an account; the location stays in the browser.
 */
export function LandingPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [where, setWhere] = useState<DistrictKey | "">("");
  const [sort, setSort] = useState<Sort>("soonest");
  const { near, locating, locate } = useNearMe(() => setSort("nearest"));
  const body: FacilitySearchInput = {
    district_code: near ? undefined : where ? DISTRICT_CODES[where] : undefined,
    near,
  };
  const results = useQuery({
    queryKey: ["discovery", "home", body],
    queryFn: () => api.booking.search(body),
  });
  const all = useAllFacilities();
  const rows = useMemo(() => {
    // one row per facility, open ones first
    const seen = new Set<string>();
    const unique = (results.data?.results ?? []).filter((r) =>
      seen.has(r.slug) ? false : (seen.add(r.slug), true),
    );
    return sortResults(unique, sort)
      .sort((a, b) => Number(b.open_now) - Number(a.open_now))
      .slice(0, LIVE_ROWS);
  }, [results.data, sort]);
  // real numbers only: per-service counts from the live listing
  const countFor = (key: ServiceKey) =>
    new Set(
      (all.data ?? []).filter((r) => r.service_code === SERVICE_CODES[key]).map((r) => r.slug),
    ).size;

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (text.trim()) params.set("q", text.trim());
    if (where) params.set("district", where);
    const query = params.toString();
    void navigate(query ? `/find-care?${query}` : "/find-care", { viewTransition: true });
  };

  return (
    <PublicLayout>
      {/* 1 · The question and the answer, side by side */}
      <section aria-labelledby="hero-title" className="border-b border-border">
        <PageContainer className="grid items-start gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:pt-16 lg:pb-20">
          <div className="flex min-w-0 flex-col items-start gap-6">
            <PageHeading
              id="hero-title"
              title={t("site.home2.title")}
              className="m-0 max-w-[16ch] font-heading text-[2.25rem] leading-[1.1] font-bold tracking-tight text-balance text-fg sm:text-[3rem]"
            >
              {t("site.home2.title")}
            </PageHeading>
            <p className="m-0 max-w-[36rem] text-[1.125rem] leading-relaxed text-fg-secondary">
              {t("site.home2.lead")}
            </p>
            <form
              onSubmit={onSearch}
              role="search"
              className="grid w-full max-w-[40rem] gap-2 sm:grid-cols-[minmax(0,1fr)_auto] [&>:first-child]:sm:col-span-2"
            >
              <SearchBar
                id="home-search"
                label={t("site.searchLabel")}
                value={text}
                onChange={setText}
                placeholder={t("site.home2.searchPlaceholder")}
              />
              <LocationSelector id="home-location" value={where} onChange={setWhere} />
              <Button type="submit" size="lg" pill className="min-h-12 px-7">
                <MagnifyingGlass aria-hidden="true" weight="bold" />
                {t("site.home2.search")}
              </Button>
            </form>
            <nav aria-labelledby="needs-title" className="flex flex-col gap-1.5">
              <p id="needs-title" className="m-0 text-body-sm text-fg-secondary">
                {t("home.chipsLabel")}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-x-6 p-0">
                {COMMON_NEEDS.map(({ key, to }) => (
                  <li key={key}>
                    <Link
                      to={to}
                      viewTransition
                      className="inline-flex min-h-target items-center font-semibold text-link underline-offset-4"
                    >
                      {t(`site.home2.chips.${key}`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/check-symptoms"
                    viewTransition
                    className="inline-flex min-h-target items-center gap-1 font-semibold text-link underline-offset-4"
                  >
                    {t("site.home2.chips.symptoms")}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          {/* the proof: what is open near the visitor, live from the facilities */}
          <section
            aria-labelledby="near-title"
            className="w-full overflow-hidden rounded-lg border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex min-w-0 flex-col">
                <h2 id="near-title" className="m-0 font-heading text-h3">
                  {t("site.home2.nearTitle")}
                </h2>
                <p role="status" className="m-0 text-caption text-fg-secondary">
                  {locating === "denied"
                    ? t("home.locationDenied")
                    : near
                      ? t("site.home.sortedByDistance")
                      : t("site.home.distanceHint")}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={near !== null}
                onClick={locate}
                disabled={locating === "busy"}
                className={cx(FILTER, "inline-flex items-center gap-1.5")}
              >
                <Crosshair
                  aria-hidden="true"
                  className={cx("size-4", locating === "busy" && "animate-spin")}
                />
                {near ? t("home.nearYou") : t("home.nearMe")}
              </button>
            </div>
            {results.isPending ? (
              <div role="status" aria-label={t("site.loading")}>
                {Array.from({ length: LIVE_ROWS }, (_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 border-b border-border px-5 py-4 last:border-b-0"
                  >
                    <Skeleton className="h-4 w-1/2 rounded-sm" />
                    <Skeleton className="h-3.5 w-1/3 rounded-sm" />
                  </div>
                ))}
              </div>
            ) : results.isError ? (
              <p role="alert" className="m-0 flex items-center gap-3 px-5 py-6">
                {t("home.failed")}
                <Button variant="secondary" onClick={() => void results.refetch()}>
                  {t("home.retry")}
                </Button>
              </p>
            ) : rows.length === 0 ? (
              <p className="m-0 px-5 py-8 text-fg-secondary">{t("site.home.nearEmpty")}</p>
            ) : (
              <ul
                aria-label={t("site.home.nearTitle")}
                className={cx(
                  "m-0 list-none p-0 transition-opacity duration-200 ease-out-quint",
                  results.isFetching && "opacity-60",
                )}
              >
                {rows.map((r) => (
                  <LiveRow key={r.slug} result={r} />
                ))}
              </ul>
            )}
            <div className="border-t border-border bg-page/60 px-5">
              <Link
                to="/facilities"
                viewTransition
                className="group inline-flex min-h-12 items-center gap-1.5 font-semibold text-link no-underline hover:underline"
              >
                {t("site.home.viewAll")}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </section>
        </PageContainer>
      </section>

      <PageContainer className="flex flex-col gap-16 py-14 lg:gap-20 lg:py-20">
        {/* 2 · The services, as an index */}
        <section aria-labelledby="care-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div className="flex flex-col gap-1">
              <h2 id="care-title" className="m-0 font-heading text-h1">
                {t("site.home2.careTitle")}
              </h2>
              <p className="m-0 text-fg-secondary">{t("site.home2.careLead")}</p>
            </div>
            <Link
              to="/services"
              viewTransition
              className="inline-flex min-h-target items-center gap-1.5 font-semibold text-link no-underline hover:underline"
            >
              {t("site.home2.allServices")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ul className="m-0 grid list-none gap-px overflow-hidden rounded-lg border border-border bg-border p-0 sm:grid-cols-2 lg:grid-cols-3">
            {CARE.map((key) => (
              <li key={key} className="bg-surface">
                <Link
                  to={`/find-care?service=${key}`}
                  viewTransition
                  className="flex min-h-[4.5rem] flex-col justify-center gap-0.5 px-5 py-3.5 no-underline transition-colors duration-150 hover:bg-page"
                >
                  <span className="font-semibold text-link">{t(`landing.services.${key}`)}</span>
                  <span className="text-body-sm text-fg-secondary tabular-nums">
                    {/* a zero reads as an empty shelf: only real counts are shown */}
                    {all.data && countFor(key) > 0
                      ? t("site.home2.facilityCount", { count: countFor(key) })
                      : " "}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 3 · How it works, in words */}
        <section aria-labelledby="how-title" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div className="flex flex-col gap-1">
              <h2 id="how-title" className="m-0 font-heading text-h1">
                {t("site.home2.howTitle")}
              </h2>
              <p className="m-0 text-fg-secondary">{t("site.home2.howLead")}</p>
            </div>
            <Link
              to="/how-it-works"
              viewTransition
              className="inline-flex min-h-target items-center gap-1.5 font-semibold text-link no-underline hover:underline"
            >
              {t("site.home.how")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ol className="m-0 grid list-none gap-8 p-0 md:grid-cols-3 md:gap-10">
            {STEPS.map((key, index) => (
              <li key={key} className="flex gap-4 border-t border-border pt-5">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-fg/25 font-heading text-body-sm font-bold text-fg tabular-nums"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="m-0 text-h3">
                    <span className="sr-only">{t("site.home2.stepLabel", { n: index + 1 })}: </span>
                    {t(`site.home2.steps.${key}.title`)}
                  </h3>
                  <p className="m-0 max-w-[34ch] text-fg-secondary">
                    {t(`site.home2.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 4 · For facilities: one quiet line, on the same surface as everything else */}
        <section
          aria-labelledby="facilities-title"
          className="flex flex-col items-start justify-between gap-5 rounded-lg border border-border bg-surface p-6 sm:p-8 md:flex-row md:items-center"
        >
          <div className="flex max-w-[44rem] flex-col gap-1.5">
            <h2 id="facilities-title" className="m-0 font-heading text-h2">
              {t("site.home2.facilitiesTitle")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("site.home2.facilitiesLead")}</p>
          </div>
          <Link
            to="/for-facilities"
            viewTransition
            className={buttonClassName({ variant: "secondary", pill: true, className: "shrink-0" })}
          >
            {t("site.home2.facilitiesAction")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </PageContainer>
    </PublicLayout>
  );
}
