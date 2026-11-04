import type { FacilityResult, FacilitySearchInput } from "@medilink/api-client";
import {
  ArrowRight,
  Baby,
  Crosshair,
  Eye,
  Flask,
  HandHeart,
  MagnifyingGlass,
  Question,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Tooth,
  Translate,
  UserCircleCheck,
  type Icon,
} from "@phosphor-icons/react";
import { Button, cx, ImigongoPattern, Skeleton } from "@medilink/ui";
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
import { FILTER, sortResults, useNearMe, waitText, type Sort } from "../features/booking/Places";
import { useAllFacilities } from "../features/site/data";
import { FacilityExplorer } from "../features/site/FacilityDirectory";
import {
  FacilityBoardIllustration,
  HillsideCareIllustration,
  StepIllustration,
} from "../features/site/illustrations";
import { LocationSelector, PageContainer, SearchBar } from "../features/site/kit";
import { PublicLayout } from "../layout/PublicLayout";

const COMMON_NEEDS: { key: string; to: string; icon: Icon }[] = [
  { key: "general", to: "/find-care?service=general", icon: Stethoscope },
  { key: "maternal", to: "/find-care?service=antenatal", icon: HandHeart },
  { key: "lab", to: "/find-care?q=lab", icon: Flask },
  { key: "dental", to: "/find-care?service=dental", icon: Tooth },
];

const CARE: { key: ServiceKey; icon: Icon }[] = [
  { key: "general", icon: Stethoscope },
  { key: "antenatal", icon: HandHeart },
  { key: "pediatrics", icon: Baby },
  { key: "dental", icon: Tooth },
  { key: "eye", icon: Eye },
  { key: "vaccination", icon: Syringe },
];

const STEPS = ["search", "join", "arrive"] as const;

const TRUST: { key: string; icon: Icon }[] = [
  { key: "noAccount", icon: UserCircleCheck },
  { key: "languages", icon: Translate },
  { key: "dataHome", icon: ShieldCheck },
];

/** How many open places the floating live panel shows. */
const LIVE_ROWS = 3;
/** A wait this long fills the meter (minutes). */
const FULL_WAIT = 180;

/** One row per facility (the listing has one row per service). */
function unique(rows: FacilityResult[]): FacilityResult[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)));
}

/** The wait as a short bar: emerald when short, ochre when long; the words carry the number. */
function WaitMeter({ result }: { result: FacilityResult }) {
  const max = result.wait_range?.max ?? (result.waiting === 0 ? 0 : null);
  if (max === null) return null;
  const long = max > 60;
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-subtle">
      <span
        className={cx(
          "block h-full rounded-full transition-[width] duration-500 ease-out-quint",
          long ? "bg-attention-solid" : "bg-primary",
        )}
        style={{ width: `${Math.max(6, Math.min(100, (max / FULL_WAIT) * 100))}%` }}
      />
    </span>
  );
}

/** The floating panel over the illustration: places open now with their live wait. */
function LivePanel({
  rows,
  loading,
  className,
}: {
  rows: FacilityResult[];
  loading: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <section
      aria-labelledby="live-title"
      className={cx(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 id="live-title" className="m-0 font-heading text-h3">
          {t("site.home2.nearTitle")}
        </h2>
        <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-success">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
            <span className="relative size-2 rounded-full bg-success" />
          </span>
          {t("site.home3.live")}
        </span>
      </div>
      {loading ? (
        <div role="status" aria-label={t("site.loading")} className="flex flex-col gap-3 px-5 pb-5">
          {Array.from({ length: LIVE_ROWS }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 px-5 pb-5 text-body-sm text-fg-secondary">{t("site.home.nearEmpty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => (
            <li key={r.slug} className="border-t border-border first:border-t-0">
              <Link
                to={`/facilities/${r.slug}`}
                viewTransition
                className="flex flex-col gap-1.5 px-5 py-3 no-underline transition-colors duration-150 hover:bg-page"
              >
                <span className="font-semibold text-fg">{r.name}</span>
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <WaitMeter result={r} />
                  </span>
                  <span className="shrink-0 text-caption text-fg-secondary tabular-nums">
                    {waitText(r, t, lang)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/facilities"
        viewTransition
        className="group flex min-h-11 items-center justify-between border-t border-border bg-page/60 px-5 text-body-sm font-semibold text-link no-underline"
      >
        {t("site.home.viewAll")}
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5"
        />
      </Link>
    </section>
  );
}

/**
 * Home `/` (second pass, 2026-11-04): clean means ordered, not bare. The first view pairs one
 * search with an illustration of care on Rwanda's hills and a floating live panel of places
 * open now; then the services with their icons, everything open on a list or a map, the three
 * steps as small pictures, and a forest band for facilities. Brand greens and one ochre for
 * long waits; numbers are real or not shown.
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
  const listed = useMemo(
    () =>
      sortResults(unique(results.data?.results ?? []), sort).sort(
        (a, b) => Number(b.open_now) - Number(a.open_now),
      ),
    [results.data, sort],
  );
  const live = listed.filter((r) => r.open_now).slice(0, LIVE_ROWS);
  // real numbers only, from the live listing
  const everywhere = unique(all.data ?? []);
  const openNow = everywhere.filter((r) => r.open_now).length;
  const waitingNow = everywhere.reduce((sum, r) => sum + (r.open_now ? (r.waiting ?? 0) : 0), 0);
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
      {/* 1 · Search, and care on the hills with what is open right now */}
      <section
        aria-labelledby="hero-title"
        className="relative isolate overflow-hidden border-b border-border bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-page)_100%)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 text-primary lg:block"
          style={{ maskImage: "linear-gradient(90deg, transparent, black 60%)" }}
        >
          <ImigongoPattern opacity={0.05} />
        </div>
        <PageContainer className="grid items-center gap-12 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-14 lg:pt-16 lg:pb-24">
          <div className="flex min-w-0 animate-rise flex-col items-start gap-6">
            {all.data && (
              <p className="m-0 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-body-sm text-fg-secondary shadow-card">
                <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                <span>
                  <strong className="font-semibold text-fg tabular-nums">
                    {t("site.home3.openNow", { count: openNow })}
                  </strong>
                  {waitingNow > 0 && ` · ${t("site.home3.waitingNow", { count: waitingNow })}`}
                </span>
              </p>
            )}
            <PageHeading
              id="hero-title"
              title={`${t("site.home3.titleA")} ${t("site.home3.titleB")}`}
              className="m-0 max-w-[15ch] font-heading text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance text-fg sm:text-[3.5rem]"
            >
              {t("site.home3.titleA")}{" "}
              <span className="text-primary">{t("site.home3.titleB")}</span>
            </PageHeading>
            <p className="m-0 max-w-[34rem] text-[1.125rem] leading-relaxed text-fg-secondary">
              {t("site.home2.lead")}
            </p>
            <form
              onSubmit={onSearch}
              role="search"
              className="grid w-full max-w-[42rem] gap-2 rounded-[1.75rem] border border-border bg-surface p-2 shadow-raised sm:grid-cols-[minmax(0,1fr)_auto] [&>:first-child]:sm:col-span-2"
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
            <nav aria-labelledby="needs-title" className="flex flex-col gap-2">
              <p id="needs-title" className="m-0 text-body-sm text-fg-secondary">
                {t("home.chipsLabel")}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {COMMON_NEEDS.map(({ key, to, icon: NeedIcon }) => (
                  <li key={key}>
                    <Link
                      to={to}
                      viewTransition
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg no-underline transition-[border-color,background-color] duration-150 hover:border-primary/50 hover:bg-brand-subtle/50"
                    >
                      <NeedIcon aria-hidden="true" className="size-4 text-primary" />
                      {t(`site.home2.chips.${key}`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/check-symptoms"
                    viewTransition
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-subtle px-3.5 text-body-sm font-semibold text-on-brand-subtle no-underline transition-colors duration-150 hover:bg-brand-subtle/70"
                  >
                    <Question aria-hidden="true" className="size-4" />
                    {t("site.home2.chips.symptoms")}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="relative min-w-0 pb-0 lg:pb-10">
            <div className="overflow-hidden rounded-[2rem] shadow-raised ring-1 ring-border">
              <HillsideCareIllustration className="block aspect-[5/4] h-auto w-full" />
            </div>
            <LivePanel
              rows={live}
              loading={results.isPending}
              className="relative -mt-16 mx-3 animate-rise [animation-delay:120ms] sm:mx-8 lg:absolute lg:-bottom-12 lg:-left-16 lg:mx-0 lg:mt-0 lg:w-[20rem]"
            />
          </div>
        </PageContainer>
      </section>

      <PageContainer className="flex flex-col gap-20 py-16 lg:gap-24 lg:py-20">
        {/* 2 · The services, each with its picture word */}
        <section aria-labelledby="care-title" className="flex flex-col gap-6">
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
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {CARE.map(({ key, icon: CareIcon }) => (
              <li key={key}>
                <Link
                  to={`/find-care?service=${key}`}
                  viewTransition
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 no-underline transition-[border-color,box-shadow,transform] duration-200 ease-out-quint hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card motion-reduce:hover:translate-y-0"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
                    <CareIcon aria-hidden="true" className="size-6" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold text-fg">{t(`landing.services.${key}`)}</span>
                    <span className="text-body-sm text-fg-secondary tabular-nums">
                      {all.data && countFor(key) > 0
                        ? t("site.home2.facilityCount", { count: countFor(key) })
                        : t("site.home3.seePlaces")}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 text-fg-muted transition-[transform,color] duration-200 ease-out-quint group-hover:translate-x-1 group-hover:text-primary"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 3 · Everything open, on a list or a map */}
        <section aria-labelledby="open-title" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <h2 id="open-title" className="m-0 font-heading text-h1">
                {t("site.home3.openTitle")}
              </h2>
              <p role="status" className="m-0 text-fg-secondary">
                {locating === "denied"
                  ? t("home.locationDenied")
                  : near
                    ? t("site.home.sortedByDistance")
                    : t("site.home3.openLead")}
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
          <FacilityExplorer
            label={t("site.home3.openTitle")}
            rows={listed.slice(0, 6)}
            loading={results.isPending}
            fetching={results.isFetching}
            failed={results.isError}
            onRetry={() => void results.refetch()}
            near={near}
            empty={<p className="m-0 px-5 py-8 text-fg-secondary">{t("site.home.nearEmpty")}</p>}
            switchable
          />
        </section>

        {/* 4 · Three steps, each a small picture */}
        <section aria-labelledby="how-title" className="flex flex-col gap-8">
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
          <ol className="relative m-0 grid list-none gap-5 p-0 md:grid-cols-3">
            <span
              aria-hidden="true"
              className="absolute top-[5.5rem] right-[16%] left-[16%] hidden border-t-2 border-dashed border-primary/30 md:block"
            />
            {STEPS.map((key, index) => (
              <li
                key={key}
                className="relative flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 pt-4 pb-6 text-center"
              >
                <StepIllustration step={key} className="h-36 w-auto" />
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-full bg-forest font-heading text-body-sm font-bold text-on-forest tabular-nums"
                >
                  {index + 1}
                </span>
                <h3 className="m-0 text-h3">
                  <span className="sr-only">{t("site.home2.stepLabel", { n: index + 1 })}: </span>
                  {t(`site.home2.steps.${key}.title`)}
                </h3>
                <p className="m-0 max-w-[30ch] text-fg-secondary">
                  {t(`site.home2.steps.${key}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 5 · What people can count on */}
        <ul
          aria-label={t("site.home3.trustLabel")}
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3"
        >
          {TRUST.map(({ key, icon: TrustIcon }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
                <TrustIcon aria-hidden="true" className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="font-semibold text-fg">{t(`site.home3.trust.${key}.title`)}</span>
                <span className="text-body-sm text-fg-secondary">
                  {t(`site.home3.trust.${key}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PageContainer>

      {/* 6 · For facilities: the forest band */}
      <section
        aria-labelledby="facilities-title"
        className="relative isolate overflow-hidden bg-forest text-on-forest"
      >
        <div aria-hidden="true" className="absolute inset-0 -z-10 text-on-forest-accent">
          <ImigongoPattern opacity={0.06} />
        </div>
        <PageContainer className="grid items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:py-20">
          <div className="flex max-w-[38rem] flex-col items-start gap-4">
            <h2
              id="facilities-title"
              className="m-0 font-heading text-[2rem] leading-tight text-on-forest"
            >
              {t("site.home2.facilitiesTitle")}
            </h2>
            <p className="m-0 text-[1.125rem] leading-relaxed text-on-forest-muted">
              {t("site.home2.facilitiesLead")}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-on-forest">
              {(["queue", "bookings", "records"] as const).map((key) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-on-forest-accent" />
                  {t(`site.home3.facilityPoints.${key}`)}
                </li>
              ))}
            </ul>
            <Link
              to="/for-facilities"
              viewTransition
              className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-full bg-on-forest px-6 font-semibold text-forest no-underline transition-[filter] duration-150 hover:brightness-95"
            >
              {t("site.home2.facilitiesAction")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <FacilityBoardIllustration className="hidden h-auto w-full lg:block" />
        </PageContainer>
      </section>
    </PublicLayout>
  );
}
