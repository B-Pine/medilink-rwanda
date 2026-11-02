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
import { FILTER, PlacesView, sortResults, useNearMe, type Sort } from "../features/booking/Places";
import { EMERGENCY } from "../features/site/data";
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
    () => sortResults(results.data?.results ?? [], sort).slice(0, 8),
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

      <PageContainer className="ml-stagger flex flex-col gap-20 py-16 lg:gap-24 lg:py-20">
        {/* 3 · Facilities near you */}
        <div className="flex flex-col gap-4">
          <PlacesView
            heading={t("site.home.nearTitle")}
            headingId="near-title"
            rows={rows}
            state={results.status}
            busy={results.isFetching && !results.isPending}
            onRetry={() => void results.refetch()}
            near={near}
            sort={sort}
            onSort={setSort}
            toolbar={
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
            }
            empty={t("site.home.nearEmpty")}
          />
          {locating === "denied" && (
            <p role="status" className="m-0 text-body-sm text-fg-secondary">
              {t("home.locationDenied")}
            </p>
          )}
          <Link
            to="/facilities"
            viewTransition
            className="inline-flex min-h-target items-center gap-1.5 self-start font-semibold text-link"
          >
            {t("site.home.viewAll")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {/* 4 · Emergency */}
        <section
          aria-labelledby="emergency-title"
          className="flex flex-col gap-5 rounded-3xl bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:p-8"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-danger-bg text-danger">
            <Siren aria-hidden="true" weight="bold" className="size-7" />
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
          <h2 id="how-title" className="m-0 text-h2 tracking-tight">
            {t("site.home.howTitle")}
          </h2>
          <ol className="relative m-0 grid list-none gap-8 p-0 lg:grid-cols-4 lg:gap-6">
            <span
              aria-hidden="true"
              className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-border lg:block"
            />
            {STEPS.map(({ key, icon: StepIcon }, index) => (
              <li
                key={key}
                className="relative flex gap-4 lg:flex-col lg:items-center lg:text-center"
              >
                <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-primary shadow-card">
                  <StepIcon aria-hidden="true" className="size-7" />
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-forest text-caption font-bold text-on-forest">
                    {index + 1}
                  </span>
                </span>
                <div className="flex flex-col gap-1">
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
        <PageContainer className="flex flex-col items-start gap-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
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
      <PageContainer className="flex flex-col items-center gap-5 py-16 text-center lg:py-20">
        <h2 className="m-0 text-h1 tracking-tight">{t("site.home.readyTitle")}</h2>
        <Link
          to="/find-care"
          viewTransition
          className={buttonClassName({ size: "lg", pill: true, className: "px-8" })}
        >
          {t("nav.findCare")}
        </Link>
      </PageContainer>
    </PublicLayout>
  );
}
