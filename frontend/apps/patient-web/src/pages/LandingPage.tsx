import type { FacilitySearchInput } from "@medilink/api-client";
import {
  ArrowRight,
  ClockCountdown,
  Crosshair,
  FirstAid,
  MagnifyingGlass,
  Phone,
  Siren,
  Ticket,
  type Icon,
} from "@phosphor-icons/react";
import { Button, buttonClassName, cx, ImigongoPattern } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../app/services";
import { PageHeading } from "../components/PageHeading";
import { DISTRICT_CODES, type DistrictKey } from "../features/booking/discovery";
import { FILTER, sortResults, useNearMe, type Sort } from "../features/booking/Places";
import { EMERGENCY } from "../features/site/data";
import { FacilityExplorer } from "../features/site/FacilityCards";
import { HeroIllustration } from "../features/site/illustrations";
import { LocationSelector, PageContainer, SearchBar } from "../features/site/kit";
import { PublicLayout } from "../layout/PublicLayout";

const STEPS: { key: string; icon: Icon }[] = [
  { key: "find", icon: MagnifyingGlass },
  { key: "check", icon: ClockCountdown },
  { key: "join", icon: Ticket },
  { key: "receive", icon: FirstAid },
];

/**
 * Home `/` (upgrade 11 §4): hero with the custom illustration, a search for any need, the live
 * list and map of facilities, emergency access, how MediLink works, the sign-in invitation and a
 * last call to find care. Works without an account; the location stays in the browser (S5 D-2).
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
  const rows = useMemo(
    () => sortResults(results.data?.results ?? [], sort).slice(0, 6),
    [results.data, sort],
  );

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
      {/* 1 · Hero */}
      <section
        aria-labelledby="hero-title"
        className="relative isolate overflow-hidden bg-brand-subtle/60"
      >
        <ImigongoPattern opacity={0.05} className="-z-10 text-primary" />
        <PageContainer className="ml-stagger grid items-center gap-10 pt-14 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex max-w-xl flex-col items-start gap-5">
            <p className="m-0 text-caption font-semibold tracking-[0.14em] text-primary uppercase">
              {t("site.home.label")}
            </p>
            <PageHeading
              id="hero-title"
              title={t("site.home.title")}
              className="font-heading text-[2.5rem] leading-[1.08] font-bold tracking-tight text-fg sm:text-[3.25rem]"
            >
              {t("site.home.title")}
            </PageHeading>
            <p className="m-0 max-w-md text-[1.125rem] leading-relaxed text-fg-secondary">
              {t("site.home.lead")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/find-care"
                viewTransition
                className={buttonClassName({ size: "lg", pill: true, className: "px-7" })}
              >
                {t("nav.findCare")}
                <ArrowRight aria-hidden="true" className="size-5" />
              </Link>
              <Link
                to="/how-it-works"
                viewTransition
                className="inline-flex min-h-target items-center font-semibold text-link"
              >
                {t("site.home.how")}
              </Link>
            </div>
            <p className="m-0 text-body-sm text-fg-muted">{t("site.home.reassure")}</p>
          </div>
          <HeroIllustration className="mx-auto max-w-[32rem]" />
        </PageContainer>
      </section>

      {/* 2 · Search */}
      <PageContainer className="relative z-10 -mt-10">
        <section
          aria-labelledby="search-title"
          className="animate-rise rounded-3xl bg-surface p-5 shadow-raised sm:p-7"
        >
          <h2 id="search-title" className="m-0 text-h2 tracking-tight">
            {t("site.home.searchTitle")}
          </h2>
          <p className="m-0 mt-1 text-fg-secondary">{t("site.home.searchLead")}</p>
          <form
            onSubmit={onSearch}
            role="search"
            className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]"
          >
            <SearchBar
              id="home-search"
              label={t("site.searchLabel")}
              value={text}
              onChange={setText}
              placeholder={t("site.searchPlaceholder")}
            />
            <LocationSelector id="home-location" value={where} onChange={setWhere} />
            <Button type="submit" size="lg" pill className="min-h-12 px-7">
              {t("nav.findCare")}
            </Button>
          </form>
        </section>
      </PageContainer>

      <PageContainer className="flex flex-col gap-20 py-16 lg:gap-28 lg:py-24">
        {/* 3 · Facilities near you */}
        {/* cards; once the visitor shares a location they sort by distance and show the km */}
        <section aria-labelledby="near-title" className="flex flex-col gap-5">
          <div className="ml-reveal flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="near-title" className="m-0 text-h2 tracking-tight">
                {t("site.home.nearTitle")}
              </h2>
              <p role="status" className="m-0 text-body-sm text-fg-secondary">
                {locating === "denied"
                  ? t("home.locationDenied")
                  : near
                    ? t("site.home.sortedByDistance")
                    : t("site.home.distanceHint")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <Link
                to="/facilities"
                viewTransition
                className="group inline-flex min-h-target items-center gap-1.5 px-2 font-semibold text-link no-underline hover:underline"
              >
                {t("site.home.viewAll")}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
          <FacilityExplorer
            label={t("site.home.nearTitle")}
            rows={rows}
            loading={results.isPending}
            fetching={results.isFetching}
            failed={results.isError}
            onRetry={() => void results.refetch()}
            near={near}
            empty={
              <p className="m-0 p-8 text-center text-fg-secondary">{t("site.home.nearEmpty")}</p>
            }
          />
        </section>

        {/* 4 · Emergency */}
        <section
          aria-labelledby="emergency-title"
          className="ml-reveal relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-danger/20 bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:p-8"
        >
          {/* a red edge: the one band on the page that is about danger */}
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-danger-solid" />
          <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-danger-bg text-danger">
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-ping rounded-2xl bg-danger-bg opacity-60 [animation-duration:2.4s] motion-reduce:hidden"
            />
            <Siren aria-hidden="true" weight="bold" className="relative size-7" />
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <h2 id="emergency-title" className="m-0 text-h2 tracking-tight">
              {t("site.home.emergencyTitle")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("site.home.emergencyLead")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`tel:${EMERGENCY.number}`}
              className="inline-flex min-h-target items-center gap-1.5 font-semibold text-danger"
            >
              <Phone aria-hidden="true" weight="bold" className="size-4" />
              {t("site.call", { number: EMERGENCY.number })}
            </a>
            <Link
              to="/emergency"
              viewTransition
              className={buttonClassName({ variant: "secondary", pill: true })}
            >
              {t("site.home.emergencyAction")}
            </Link>
          </div>
        </section>

        {/* 5 · How MediLink works */}
        <section aria-labelledby="how-title" className="flex flex-col gap-8">
          <div className="ml-reveal flex flex-wrap items-end justify-between gap-4">
            <h2 id="how-title" className="m-0 text-h2 tracking-tight">
              {t("site.home.howTitle")}
            </h2>
            <Link
              to="/how-it-works"
              viewTransition
              className="group inline-flex min-h-target items-center gap-1.5 font-semibold text-link no-underline hover:underline"
            >
              {t("site.home.how")}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
              />
            </Link>
          </div>
          {/* four cards, each rising in turn as the row scrolls into view */}
          <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ key, icon: StepIcon }, index) => (
              <li
                key={key}
                style={{ animationRange: `entry ${index * 8}% entry ${60 + index * 8}%` }}
                className="ml-reveal group relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-surface p-6 shadow-card transition-[box-shadow,translate] duration-300 ease-out-quint hover:-translate-y-1 hover:shadow-raised motion-reduce:hover:translate-y-0"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-3 -right-1 font-heading text-[5rem] leading-none font-extrabold text-brand-subtle tabular-nums select-none"
                >
                  {index + 1}
                </span>
                <span className="relative grid size-12 place-items-center rounded-2xl bg-brand-subtle text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-on-primary">
                  <StepIcon aria-hidden="true" weight="duotone" className="size-6" />
                </span>
                <div className="relative flex flex-col gap-1">
                  <h3 className="m-0 text-h3">{t(`site.home.steps.${key}.title`)}</h3>
                  <p className="m-0 text-body-sm text-fg-secondary">
                    {t(`site.home.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </PageContainer>

      {/* 6 · Sign-in invitation */}
      <section
        aria-labelledby="account-title"
        className="relative isolate overflow-hidden bg-forest text-on-forest"
      >
        <ImigongoPattern opacity={0.07} className="-z-10 text-on-forest-accent" />
        <PageContainer className="ml-reveal flex flex-col items-start gap-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div className="flex max-w-xl flex-col gap-3">
            <h2 id="account-title" className="m-0 text-h1 tracking-tight text-on-forest">
              {t("site.home.accountTitle")}
            </h2>
            <p className="m-0 text-on-forest-muted">{t("site.home.accountLead")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/login"
              viewTransition
              className="inline-flex min-h-12 items-center rounded-full bg-on-forest px-7 font-semibold text-forest no-underline transition-[filter,transform] duration-150 ease-out-quint hover:brightness-95 active:scale-[0.97]"
            >
              {t("nav.login")}
            </Link>
            <Link
              to="/find-care"
              viewTransition
              className="inline-flex min-h-target items-center font-semibold text-on-forest underline-offset-4 hover:underline"
            >
              {t("site.home.exploreFirst")}
            </Link>
          </div>
        </PageContainer>
      </section>

      {/* 7 · Final action */}
      <PageContainer className="py-16 lg:py-24">
        <section
          aria-labelledby="ready-title"
          className="ml-reveal relative isolate flex flex-col items-center gap-5 overflow-hidden rounded-[2rem] bg-brand-subtle px-6 py-14 text-center"
        >
          <ImigongoPattern opacity={0.06} className="-z-10 text-primary" />
          <h2 id="ready-title" className="m-0 max-w-2xl text-h1 tracking-tight text-balance">
            {t("site.home.readyTitle")}
          </h2>
          <p className="m-0 max-w-md text-fg-secondary">{t("site.home.reassure")}</p>
          <Link
            to="/find-care"
            viewTransition
            className={buttonClassName({
              size: "lg",
              pill: true,
              className: "group px-8 shadow-raised",
            })}
          >
            {t("nav.findCare")}
            <ArrowRight
              aria-hidden="true"
              className="size-5 transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
            />
          </Link>
        </section>
      </PageContainer>
    </PublicLayout>
  );
}
