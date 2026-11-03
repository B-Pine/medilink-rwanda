import type { FacilitySearchInput } from "@medilink/api-client";
import {
  ArrowRight,
  Baby,
  ChartLineUp,
  CheckCircle,
  Crosshair,
  Eye,
  MagnifyingGlass,
  Stethoscope,
  Syringe,
  Ticket,
  Tooth,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Button, cx } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
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
import { FILTER, sortResults, useNearMe, type Sort } from "../features/booking/Places";
import { useAllFacilities } from "../features/site/data";
import { FacilityExplorer } from "../features/site/FacilityDirectory";
import { HillsideClinicIllustration } from "../features/site/illustrations";
import { LocationSelector, PageContainer, SearchBar } from "../features/site/kit";
import { PublicLayout } from "../layout/PublicLayout";

/** The example ticket on the "arrive" phone screen (a sample, not a real patient). */
const DEMO_TICKET = "G-014";

const POPULAR: { key: string; to: string }[] = [
  { key: "general", to: "/find-care?service=general" },
  { key: "maternal", to: "/find-care?service=antenatal" },
  { key: "lab", to: "/find-care?q=lab" },
  { key: "dental", to: "/find-care?service=dental" },
];

const CARE_TILES: { key: ServiceKey; icon: Icon }[] = [
  { key: "general", icon: Stethoscope },
  { key: "antenatal", icon: Baby },
  { key: "pediatrics", icon: UserCircle },
  { key: "dental", icon: Tooth },
  { key: "eye", icon: Eye },
  { key: "vaccination", icon: Syringe },
];

const STEPS: { key: "search" | "join" | "arrive"; icon: Icon }[] = [
  { key: "search", icon: MagnifyingGlass },
  { key: "join", icon: Ticket },
  { key: "arrive", icon: CheckCircle },
];

/** A phone screen for "How it works": the app's own parts, scaled down. */
function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-[15rem] rounded-[2rem] border-[6px] border-fg/90 bg-page p-3 shadow-raised"
    >
      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-fg/20" />
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function PhoneRow({
  title,
  meta,
  tone = "brand",
}: {
  title: string;
  meta: string;
  tone?: "brand" | "busy";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2.5">
      <span className="text-caption font-bold text-fg">{title}</span>
      <span
        className={cx(
          "self-start rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
          tone === "busy"
            ? "bg-attention-bg text-attention"
            : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        {meta}
      </span>
    </div>
  );
}

/**
 * Home `/` (redesign "clinical calm"): seven sections, one job each. Hero with search and popular
 * needs; real numbers; what care; open near you; three steps on phone screens; a band for
 * facilities; the footer. Works without an account; the location stays in the browser (S5 D-2).
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
    // one card per facility, open ones first
    const seen = new Set<string>();
    const unique = (results.data?.results ?? []).filter((r) =>
      seen.has(r.slug) ? false : (seen.add(r.slug), true),
    );
    return sortResults(unique, sort)
      .sort((a, b) => Number(b.open_now) - Number(a.open_now))
      .slice(0, 6);
  }, [results.data, sort]);
  // real numbers only: facilities and per-service counts from the live listing
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
      {/* 1 · Hero: search first, photo with live UI cards beside */}
      <section aria-labelledby="hero-title" className="ml-hero-mesh border-b border-border">
        <PageContainer className="grid items-center gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12 lg:pt-14 lg:pb-20">
          <div className="ml-hero-seq flex min-w-0 flex-col items-start gap-5">
            <PageHeading
              id="hero-title"
              title={t("site.home2.title")}
              className="font-heading text-[2.25rem] leading-[1.08] font-extrabold tracking-tight text-balance text-fg sm:text-[3.25rem]"
            >
              {t("site.home2.title")}
            </PageHeading>
            <p className="m-0 max-w-[34rem] text-[1.125rem] leading-relaxed text-fg-secondary">
              {t("site.home2.lead")}
            </p>
            <form
              onSubmit={onSearch}
              role="search"
              className="grid w-full gap-2 rounded-3xl border border-border/70 bg-surface p-2 shadow-raised sm:grid-cols-[minmax(0,1fr)_auto] [&>:first-child]:sm:col-span-2"
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
            <div className="flex flex-col gap-2">
              <p className="m-0 text-body-sm font-semibold text-fg-secondary">
                {t("site.home2.popular")}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {POPULAR.map(({ key, to }) => (
                  <li key={key}>
                    <Link
                      to={to}
                      viewTransition
                      className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-body-sm font-semibold text-fg no-underline transition-colors duration-150 hover:border-primary hover:text-primary"
                    >
                      {t(`site.home2.chips.${key}`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/check-symptoms"
                    viewTransition
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-subtle px-4 text-body-sm font-semibold text-on-brand-subtle no-underline transition-colors duration-150 hover:bg-primary hover:text-on-primary"
                  >
                    {t("site.home2.chips.symptoms")}
                    <ArrowRight aria-hidden="true" weight="bold" className="size-3.5" />
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem] pb-6 lg:pb-0">
            <HillsideClinicIllustration className="block h-auto w-full" />
          </div>
        </PageContainer>
      </section>

      <PageContainer className="flex flex-col gap-20 py-16 lg:gap-24 lg:py-20">
        {/* 3 · What care do you need? */}
        <section aria-labelledby="care-title" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 id="care-title" className="m-0 font-heading text-h1 font-bold tracking-tight">
              {t("site.home2.careTitle")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("site.home2.careLead")}</p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {CARE_TILES.map(({ key, icon: TileIcon }) => (
              <li key={key}>
                <Link
                  to={`/find-care?service=${key}`}
                  viewTransition
                  className="ml-lift group flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-fg no-underline hover:border-primary/50"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-subtle text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-on-primary">
                    <TileIcon aria-hidden="true" weight="duotone" className="size-6" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{t(`landing.services.${key}`)}</span>
                    <span className="text-body-sm text-fg-secondary tabular-nums">
                      {/* a zero reads as an empty shelf: only real counts are shown */}
                      {all.data && countFor(key) > 0
                        ? t("site.home2.facilityCount", { count: countFor(key) })
                        : " "}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 4 · Open near you */}
        <section aria-labelledby="near-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="near-title" className="m-0 font-heading text-h1 font-bold tracking-tight">
                {t("site.home2.nearTitle")}
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
                className={cx(FILTER, "inline-flex min-h-11 items-center gap-1.5")}
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
                className="group inline-flex min-h-11 items-center gap-1.5 px-2 font-semibold text-link no-underline hover:underline"
              >
                {t("site.home.viewAll")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
          <FacilityExplorer
            switchable
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

        {/* 5 · From search to seen, in three steps */}
        <section aria-labelledby="how-title" className="flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h2 id="how-title" className="m-0 font-heading text-h1 font-bold tracking-tight">
              {t("site.home2.howTitle")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("site.home2.howLead")}</p>
          </div>
          <ol className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
            {STEPS.map(({ key, icon: StepIcon }, index) => (
              <li
                key={key}
                className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-subtle text-primary">
                    <StepIcon aria-hidden="true" weight="bold" className="size-5" />
                  </span>
                  <span className="sr-only">{t("site.home2.stepLabel", { n: index + 1 })}</span>
                  <h3 className="m-0 text-h3">{t(`site.home2.steps.${key}.title`)}</h3>
                </div>
                <p className="m-0 text-body-sm text-fg-secondary">
                  {t(`site.home2.steps.${key}.body`)}
                </p>
                {key === "search" && (
                  <Phone>
                    <div className="rounded-full border border-border bg-surface px-3 py-2 text-[0.6875rem] text-fg-secondary">
                      {t("site.home2.phone.search")}
                    </div>
                    <PhoneRow
                      title={t("site.home2.phone.place1")}
                      meta={t("site.home2.phone.wait1")}
                    />
                    <PhoneRow
                      title={t("site.home2.phone.place2")}
                      meta={t("site.home2.phone.wait2")}
                      tone="busy"
                    />
                  </Phone>
                )}
                {key === "join" && (
                  <Phone>
                    <PhoneRow
                      title={t("site.home2.phone.service")}
                      meta={t("site.home2.phone.slot")}
                    />
                    <div className="rounded-xl bg-primary px-3 py-2 text-center text-caption font-bold text-on-primary">
                      {t("site.home2.phone.joinButton")}
                    </div>
                  </Phone>
                )}
                {key === "arrive" && (
                  <Phone>
                    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-3">
                      <span className="text-[0.6875rem] text-fg-secondary">
                        {t("site.home2.phone.ticket")}
                      </span>
                      <span className="font-heading text-h2 font-extrabold text-primary tabular-nums">
                        {DEMO_TICKET}
                      </span>
                      <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[0.6875rem] font-semibold text-on-brand-subtle">
                        {t("site.home2.float.queue")}
                      </span>
                    </div>
                  </Phone>
                )}
              </li>
            ))}
          </ol>
        </section>
      </PageContainer>

      {/* 6 · For facilities: one dark band, with the live dashboard */}
      <section aria-labelledby="facilities-title" className="bg-forest text-on-forest">
        <PageContainer className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col items-start gap-4">
            <p className="m-0 text-caption font-semibold tracking-[0.14em] text-on-forest-muted uppercase">
              {t("nav.forFacilities")}
            </p>
            <h2
              id="facilities-title"
              className="m-0 font-heading text-h1 font-bold tracking-tight text-on-forest"
            >
              {t("site.home2.facilitiesTitle")}
            </h2>
            <p className="m-0 max-w-lg text-on-forest-muted">{t("site.home2.facilitiesLead")}</p>
            <Link
              to="/for-facilities"
              viewTransition
              className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-full bg-on-forest px-6 font-semibold text-forest no-underline transition-[filter] duration-150 hover:brightness-95"
            >
              {t("site.home2.facilitiesAction")}
              <ArrowRight aria-hidden="true" weight="bold" className="size-4" />
            </Link>
          </div>
          <div aria-hidden="true" className="rounded-3xl bg-surface p-5 text-fg shadow-raised">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-heading font-bold">{t("site.home2.dash.title")}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-caption font-semibold text-on-brand-subtle">
                <span className="ml-live-dot" />
                {t("site.home2.dash.live")}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("site.home2.dash.queue"), value: "18" },
                { label: t("site.home2.dash.wait"), value: "24 min" },
                { label: t("site.home2.dash.seen"), value: "86" },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border border-border p-3">
                  <span className="block text-caption text-fg-secondary">{k.label}</span>
                  <span className="font-heading text-h2 font-extrabold tabular-nums">
                    {k.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-24 items-end gap-1.5 rounded-2xl bg-page p-3">
              {[34, 52, 61, 48, 72, 66, 80, 58, 44, 38].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-md bg-primary/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <p className="m-0 mt-3 inline-flex items-center gap-1.5 text-caption text-fg-secondary">
              <ChartLineUp className="size-3.5" />
              {t("site.home2.dash.note")}
            </p>
          </div>
        </PageContainer>
      </section>
    </PublicLayout>
  );
}
