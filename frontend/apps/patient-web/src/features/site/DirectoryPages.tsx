import type { PublicSlot } from "@medilink/api-client";
import {
  ArrowRight,
  Baby,
  CalendarCheck,
  Crosshair,
  Eye,
  FirstAidKit,
  Flask,
  HandHeart,
  Stethoscope,
  Syringe,
  Tooth,
} from "@phosphor-icons/react";
import { Button, buttonClassName, cx } from "@medilink/ui";
import { kigaliDate } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PublicLayout } from "../../layout/PublicLayout";
import { DISTRICT_CODES, day, pick, time, type DistrictKey } from "../booking/discovery";
import { FILTER, FilterSelect, TYPES, useNearMe } from "../booking/Places";
import { FacilityEntries, FacilityExplorer } from "./FacilityDirectory";
import {
  categoryOf,
  doctorsOf,
  parseDoctorSlug,
  SERVICE_CATEGORIES,
  type CatalogueService,
  serviceCode,
  serviceSlug,
  useCatalogue,
  useDoctors,
  useFacilitiesOffering,
  useFacilityPages,
} from "./data";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  LocationSelector,
  NotFoundState,
  PageContainer,
  PageHeader,
  Panel,
  SearchBar,
  SectionTitle,
} from "./kit";

const WEEKDAY_BASE = Date.UTC(2024, 0, 1); // a Monday

/** A quiet picture word for a service, from its code. */
function ServiceMark({ code }: { code: string }) {
  const props = { weight: "duotone", className: "size-5" } as const;
  if (code.includes("antenatal") || code.includes("maternal")) return <HandHeart {...props} />;
  if (code.includes("vaccin")) return <Syringe {...props} />;
  if (code.includes("lab")) return <Flask {...props} />;
  if (code.includes("dental")) return <Tooth {...props} />;
  if (code.includes("eye")) return <Eye {...props} />;
  if (code.includes("paed") || code.includes("pediatric") || code.includes("child"))
    return <Baby {...props} />;
  if (code.includes("consult")) return <Stethoscope {...props} />;
  return <FirstAidKit {...props} />;
}

function weekday(index: number, language: string, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat(language === "rw" ? "en" : language, {
    weekday: style,
    timeZone: "UTC",
  }).format(new Date(WEEKDAY_BASE + index * 86_400_000));
}

/** "Mon–Fri", "Mon–Wed · Sat": consecutive days read as a range. */
const daysText = (days: number[], language: string) => {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs.at(-1);
    if (last && day === last[last.length - 1]! + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) =>
      run.length >= 3
        ? `${weekday(run[0]!, language)}–${weekday(run[run.length - 1]!, language)}`
        : run.map((d) => weekday(d, language)).join(" · "),
    )
    .join(" · ");
};

// ---- /facilities ----

/** Facility directory (upgrade 11 §5): search, location, type, service, open now, load more. */
export function FacilitiesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const [text, setText] = useState("");
  const [where, setWhere] = useState<DistrictKey | "">("");
  const [type, setType] = useState("");
  const [service, setService] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const { near, locating, locate } = useNearMe();
  const catalogue = useCatalogue(lang);
  const pages = useFacilityPages({
    district_code: !near && where ? DISTRICT_CODES[where] : undefined,
    service_code: service || undefined,
    open_now: openNow || undefined,
    near,
  });
  const words = text.trim().toLowerCase();
  const rows = (pages.data?.pages.flatMap((p) => p.results) ?? []).filter(
    (r) => (!type || r.type === type) && (!words || r.name.toLowerCase().includes(words)),
  );
  const total = pages.data?.pages[0]?.count ?? 0;
  const filtered = Boolean(text || where || type || service || openNow);
  const clear = () => {
    setText("");
    setWhere("");
    setType("");
    setService("");
    setOpenNow(false);
  };

  return (
    <PublicLayout>
      <PageContainer className="pb-20">
        <PageHeader
          tone="forest"
          crumbs={[{ label: t("nav.facilities") }]}
          title={t("site.facilities.title")}
        />
        <div className="flex flex-col gap-6">
          {/* search and every filter in one card above the results */}
          <div className="flex flex-col gap-3 rounded-panel bg-surface shadow-e2 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
              <SearchBar
                id="facility-search"
                label={t("site.searchLabel")}
                value={text}
                onChange={setText}
                placeholder={t("site.searchPlaceholder")}
              />
              <LocationSelector id="facility-location" value={where} onChange={setWhere} />
            </div>
            <div
              role="group"
              aria-label={t("care.filters")}
              className="flex flex-wrap items-center gap-2"
            >
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
              <FilterSelect
                id="facility-type"
                label={t("site.facilities.type")}
                value={type}
                onChange={setType}
              >
                <option value="">{t("home.anyType")}</option>
                {TYPES.map((key) => (
                  <option key={key} value={key}>
                    {t(`booking.types.${key}`)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                id="facility-service"
                label={t("site.facilities.service")}
                value={service}
                onChange={setService}
              >
                <option value="">{t("site.facilities.anyService")}</option>
                {(catalogue.data ?? []).map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
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
              {filtered && (
                <button
                  type="button"
                  onClick={clear}
                  className="min-h-target cursor-pointer rounded-full px-3 text-body-sm font-semibold text-link hover:underline"
                >
                  {t("site.facilities.clear")}
                </button>
              )}
              {pages.isSuccess && (
                <span role="status" className="ml-auto text-body-sm text-fg-muted tabular-nums">
                  {t("site.facilities.count", { count: type || words ? rows.length : total })}
                </span>
              )}
            </div>
            {locating === "denied" && (
              <p role="status" className="m-0 text-body-sm text-fg-secondary">
                {t("home.locationDenied")}
              </p>
            )}
          </div>

          <FacilityExplorer
            headingLevel={2}
            label={t("site.facilities.title")}
            rows={rows}
            loading={pages.isPending}
            fetching={pages.isFetching && !pages.isFetchingNextPage}
            failed={pages.isError}
            onRetry={() => void pages.refetch()}
            near={near}
            empty={
              <EmptyState
                title={t("site.facilities.none")}
                action={
                  <Button variant="secondary" pill onClick={clear}>
                    {t("site.facilities.clear")}
                  </Button>
                }
              />
            }
          />
          {pages.hasNextPage && !type && !words && (
            <Button
              variant="secondary"
              pill
              className="self-center"
              loading={pages.isFetchingNextPage}
              onClick={() => void pages.fetchNextPage()}
            >
              {t("site.facilities.loadMore")}
            </Button>
          )}
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /doctors ----

/**
 * One doctor in the directory (public design brief 2026-11-04): the name as a link, what they do,
 * where they work, and the days they are there in words. No avatar, no day chips: a list a person
 * reads down, like a hospital's own staff directory.
 */
function DoctorEntry({
  doctor,
  today,
}: {
  doctor: ReturnType<typeof useDoctors>["doctors"][number];
  today: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const here = doctor.days.includes(today);
  const work = [doctor.specialty, ...doctor.services.map((s) => pick(s.name, lang))]
    .filter(Boolean)
    .join(" · ");
  // initials as a quiet mark, never a photo (no faces published)
  const initials = doctor.name
    .replace(/^(Dr|Midwife)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    // a profile card (upgrade 14 §3): the initials in a ring, who, where, the days; the whole card
    // answers the pointer, the name is the link
    <li className="ml-card group/row relative flex min-w-0 flex-col gap-4 rounded-panel bg-surface p-5">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-brand-subtle font-heading text-body font-bold text-on-brand-subtle shadow-[0_0_0_4px_var(--color-surface),0_0_0_5px_var(--site-hairline-strong)]"
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* h2: the list sits right under the page's <h1> */}
        <h2 className="m-0 font-heading text-[1.125rem] leading-snug font-bold">
          <Link
            to={`/doctors/${doctor.slug}`}
            viewTransition
            className="text-fg no-underline transition-colors duration-150 after:absolute after:inset-0 after:content-[''] group-hover/row:text-link"
          >
            {doctor.name}
          </Link>
        </h2>
        {work && <p className="m-0 text-body-sm text-fg">{work}</p>}
        <p className="m-0 text-body-sm text-fg-secondary">
          {doctor.facilities.length > 1
            ? t("site.doctors.places", {
                name: doctor.facility.name,
                count: doctor.facilities.length - 1,
              })
            : doctor.facility.name}
          {doctor.facility.district && ` · ${doctor.facility.district}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4 text-body-sm">
        <span className="rounded-md bg-page px-2 py-0.5 font-semibold text-fg tabular-nums shadow-e1">
          <span className="sr-only">{t("site.doctors.days")}: </span>
          {daysText(doctor.days, lang)}
        </span>
        {here && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-0.5 text-caption font-semibold text-success">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {t("site.doctors.today")}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Doctor directory (upgrade 11 §5). Public doctor data comes from facility profiles until a
 * directory endpoint exists (upgrade 11 §13): name, facility, services and the days present.
 * Never patients or bookings.
 */
export function DoctorsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const { doctors, facilities, isPending, isError, refetch } = useDoctors();
  const [text, setText] = useState("");
  const [service, setService] = useState("");
  const [facility, setFacility] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const todayIndex = (new Date(`${kigaliDate()}T00:00:00Z`).getUTCDay() + 6) % 7;

  const services = useMemo(() => {
    const map = new Map<string, string>();
    for (const doctor of doctors)
      for (const s of doctor.services) map.set(s.code, pick(s.name, lang));
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [doctors, lang]);

  const words = text.trim().toLowerCase();
  const rows = doctors.filter(
    (d) =>
      (!words || d.name.toLowerCase().includes(words)) &&
      (!service || d.services.some((s) => s.code === service)) &&
      (!facility || d.facilities.some((f) => f.slug === facility)) &&
      (!todayOnly || d.days.includes(todayIndex)),
  );

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          tone="forest"
          crumbs={[{ label: t("nav.doctors") }]}
          title={t("site.doctors.title")}
        />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-panel bg-surface shadow-e2 p-4 sm:p-5">
            <SearchBar
              id="doctor-search"
              label={t("site.doctors.searchName")}
              value={text}
              onChange={setText}
              placeholder={t("site.doctors.searchName")}
            />
            <div
              role="group"
              aria-label={t("care.filters")}
              className="flex flex-wrap items-center gap-2"
            >
              <FilterSelect
                id="doctor-service"
                label={t("site.doctors.specialty")}
                value={service}
                onChange={setService}
              >
                <option value="">{t("site.doctors.anySpecialty")}</option>
                {services.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                id="doctor-facility"
                label={t("site.doctors.facility")}
                value={facility}
                onChange={setFacility}
              >
                <option value="">{t("site.doctors.anyFacility")}</option>
                {facilities.map((f) => (
                  <option key={f.slug} value={f.slug}>
                    {f.name}
                  </option>
                ))}
              </FilterSelect>
              <button
                type="button"
                aria-pressed={todayOnly}
                onClick={() => setTodayOnly((on) => !on)}
                className={FILTER}
              >
                {t("site.doctors.today")}
              </button>
              {!isPending && (
                <span role="status" className="ml-auto text-body-sm text-fg-muted tabular-nums">
                  {t("site.doctors.count", { count: rows.length })}
                </span>
              )}
            </div>
          </div>
          {isPending || isError || rows.length === 0 ? (
            <Panel as="div" className="overflow-hidden">
              {isPending ? (
                <LoadingRows rows={6} />
              ) : isError ? (
                <ErrorState onRetry={refetch} />
              ) : (
                <EmptyState title={t("site.doctors.none")} />
              )}
            </Panel>
          ) : (
            <div className="@container">
              <ul
                aria-label={t("site.doctors.title")}
                className="ml-stagger m-0 grid list-none gap-5 p-0 @xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4"
              >
                {rows.map((d) => (
                  <DoctorEntry key={d.slug} doctor={d} today={todayIndex} />
                ))}
              </ul>
            </div>
          )}
          <p className="m-0 text-caption text-fg-muted">{t("site.doctors.source")}</p>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /doctors/:slug ----

/** Doctor profile (upgrade 11 §5): who, where, services and a day-by-day picker of free times. */
export function DoctorPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const { slug = "" } = useParams();
  const parsed = parseDoctorSlug(slug);
  const profile = useQuery({
    queryKey: ["discovery", "facility", parsed?.facility ?? ""],
    queryFn: () => api.booking.facility(parsed!.facility),
    enabled: parsed !== null,
  });
  const doctor = profile.data
    ? doctorsOf(profile.data).find((d) => d.membershipId === parsed?.membership)
    : undefined;
  const firstService = doctor?.services[0];
  const slots = useQuery({
    queryKey: ["discovery", "doctor-slots", slug, firstService?.code],
    queryFn: () =>
      api.booking.slots(parsed!.facility, {
        service_id: firstService!.id,
        date: kigaliDate(),
        membership_id: parsed!.membership,
      }),
    enabled: Boolean(doctor && firstService),
  });
  const [picked, setPicked] = useState<string | null>(null);

  if (parsed === null || profile.isError || (profile.isSuccess && !doctor)) {
    return (
      <PublicLayout>
        <PageContainer narrow>
          <NotFoundState
            title={t("site.doctor.notFound")}
            reason={t("site.doctor.notFoundReason")}
            back={{ to: "/doctors", label: t("site.doctor.allDoctors") }}
          />
        </PageContainer>
      </PublicLayout>
    );
  }

  const days = slots.data?.days ?? [];
  const activeDay =
    days.find((d) => d.date === picked) ?? days.find((d) => d.slots.length > 0) ?? days[0];
  const free = (list: PublicSlot[]) => list.filter((s) => s.open_places > 0);

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ to: "/doctors", label: t("nav.doctors") }, { label: doctor?.name ?? "…" }]}
          title={doctor?.name ?? "…"}
          lead={
            doctor
              ? [doctor.specialty, ...doctor.services.map((s) => pick(s.name, lang))]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        />
        {profile.isPending || !doctor ? (
          <Panel as="div">
            <LoadingRows rows={3} />
          </Panel>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <Panel as="aside" className="self-start p-6">
              <dl className="m-0 flex flex-col divide-y divide-hairline [&>div]:py-3.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
                <div>
                  <dt className="text-body-sm font-semibold text-fg-secondary">
                    {t("site.doctors.facility")}
                  </dt>
                  <dd className="m-0 mt-1">
                    <Link
                      to={`/facilities/${doctor.facility.slug}`}
                      viewTransition
                      className="font-semibold"
                    >
                      {doctor.facility.name}
                    </Link>
                    <span className="block text-body-sm text-fg-secondary">
                      {doctor.facility.district}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-body-sm font-semibold text-fg-secondary">
                    {t("site.doctor.worksIn")}
                  </dt>
                  <dd className="m-0 mt-1">
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {doctor.services.map((s) => (
                        <li key={s.code}>
                          <Link
                            to={`/services/${serviceSlug(s.code)}`}
                            viewTransition
                            className="font-semibold"
                          >
                            {pick(s.name, lang)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt className="text-body-sm font-semibold text-fg-secondary">
                    {t("site.doctor.presentDays")}
                  </dt>
                  <dd className="m-0 mt-1 font-semibold">{daysText(doctor.days, lang)}</dd>
                </div>
                {doctor.languages.length > 0 && (
                  <div>
                    <dt className="text-body-sm font-semibold text-fg-secondary">
                      {t("site.doctor.languages")}
                    </dt>
                    <dd className="m-0 mt-1 font-semibold">
                      {doctor.languages
                        .map((code) => t(`site.doctor.spoken.${code}`, { defaultValue: code }))
                        .join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>

            <div className="flex min-w-0 flex-col gap-6">
              {pick(doctor.bio, lang) && (
                <Panel aria-labelledby="about-doctor" className="flex flex-col gap-3 p-6">
                  <SectionTitle id="about-doctor">{t("site.doctor.about")}</SectionTitle>
                  <p className="m-0 whitespace-pre-line text-fg">{pick(doctor.bio, lang)}</p>
                </Panel>
              )}
              <Panel aria-labelledby="availability" className="flex flex-col gap-5 p-6">
                <SectionTitle id="availability">{t("site.doctor.availability")}</SectionTitle>
                {!firstService ? (
                  <p className="m-0 text-fg-secondary">{t("site.doctor.noTimes")}</p>
                ) : slots.isPending ? (
                  <LoadingRows rows={2} />
                ) : slots.isError ? (
                  <ErrorState onRetry={() => void slots.refetch()} />
                ) : (
                  <>
                    <div
                      role="group"
                      aria-label={t("site.doctor.pickDay")}
                      className="grid grid-cols-4 gap-2 sm:grid-cols-7"
                    >
                      {days.map((d) => {
                        const count = free(d.slots).length;
                        const selected = d.date === activeDay?.date;
                        return (
                          <button
                            key={d.date}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setPicked(d.date)}
                            className={cx(
                              "flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-[background-color,border-color,transform] duration-200 ease-out-quint active:scale-[0.97]",
                              selected
                                ? "border-primary bg-brand-subtle text-on-brand-subtle"
                                : "border-border bg-surface text-fg hover:border-fg-muted",
                            )}
                          >
                            <span className="text-caption font-semibold">
                              {day(d.date, lang, "short")}
                            </span>
                            <span
                              className={cx(
                                "text-caption tabular-nums",
                                count ? "font-semibold text-primary" : "text-fg-muted",
                              )}
                            >
                              {count ? t("site.doctor.free", { count }) : t("site.doctor.full")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {activeDay && free(activeDay.slots).length > 0 ? (
                      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                        {free(activeDay.slots).map((s) => (
                          <li key={s.id} className="animate-enter">
                            <span className="inline-flex min-h-10 items-center rounded-full bg-subtle px-4 font-semibold tabular-nums">
                              {time(s.starts_at, lang)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="m-0 text-fg-secondary">{t("site.doctor.noTimes")}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                      <p className="m-0 text-caption text-fg-muted">{t("site.doctor.privacy")}</p>
                      <Link
                        to={`/book/${doctor.facility.slug}?doctor=${doctor.membershipId}&service=${firstService.id}`}
                        viewTransition
                        className={buttonClassName({ pill: true })}
                      >
                        <CalendarCheck aria-hidden="true" className="size-5" />
                        {t("site.doctor.book")}
                      </Link>
                    </div>
                  </>
                )}
              </Panel>
            </div>
          </div>
        )}
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /services ----

/**
 * Services directory (upgrade 11 §5; public design brief 2026-11-04): the public catalogue as an
 * index, the way a hospital lists its departments. Categories in a column on the left to jump
 * to; each category a heading over its services as links on one surface with hairlines.
 */
export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const catalogue = useCatalogue(lang);
  const [text, setText] = useState("");
  const words = text.trim().toLowerCase();
  const items = (catalogue.data ?? []).filter(
    (s) => !words || s.name.toLowerCase().includes(words),
  );
  const categories = SERVICE_CATEGORIES.map(({ key }) => ({
    key,
    services: items.filter((s) => s.category === key),
  })).filter((c) => c.services.length > 0);

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          tone="forest"
          crumbs={[{ label: t("nav.services") }]}
          title={t("site.services.title")}
        />
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            <SearchBar
              id="service-search"
              label={t("site.services.search")}
              value={text}
              onChange={setText}
              placeholder={t("site.services.search")}
            />
            {/* jump to a category; the page glides there (base.css smooth scrolling) */}
            {categories.length > 0 && (
              <nav aria-label={t("site.services.jump")}>
                <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0 lg:flex-col lg:border-l lg:border-border">
                  {categories.map(({ key, services }) => (
                    <li key={key}>
                      <a
                        href={`#cat-${key}`}
                        className="flex min-h-target items-center justify-between gap-3 text-body-sm font-semibold text-link no-underline hover:underline lg:-ml-px lg:border-l lg:border-transparent lg:pl-4 lg:hover:border-fg-muted"
                      >
                        {t(`site.services.categories.${key}`)}
                        <span className="font-normal text-fg-muted tabular-nums">
                          {services.length}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-10">
            {catalogue.isPending ? (
              <Panel as="div">
                <LoadingRows rows={5} />
              </Panel>
            ) : catalogue.isError ? (
              <Panel as="div">
                <ErrorState onRetry={() => void catalogue.refetch()} />
              </Panel>
            ) : categories.length === 0 ? (
              <Panel as="div">
                <EmptyState title={t("site.services.none")} />
              </Panel>
            ) : (
              categories.map(({ key, services }) => (
                <section
                  key={key}
                  aria-labelledby={`cat-${key}`}
                  className="flex scroll-mt-28 flex-col gap-3"
                >
                  <h2
                    id={`cat-${key}`}
                    className="m-0 font-heading text-[1.5rem] leading-tight font-bold tracking-[-0.02em]"
                  >
                    {t(`site.services.categories.${key}`)}
                  </h2>
                  <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                    {services.map((s) => (
                      <li key={s.code}>
                        <Link
                          to={`/services/${serviceSlug(s.code)}`}
                          viewTransition
                          className="group flex items-center gap-4 rounded-panel bg-surface p-4 no-underline shadow-e1 transition-[box-shadow,transform] duration-300 ease-out-quint hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:hover:translate-y-0"
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(140deg,var(--color-brand-subtle),var(--color-surface))] text-on-brand-subtle shadow-e1"
                          >
                            <ServiceMark code={s.code} />
                          </span>
                          <span className="min-w-0 flex-1 font-semibold text-fg">{s.name}</span>
                          <ArrowRight
                            aria-hidden="true"
                            className="size-5 text-fg-muted transition-[transform,color] duration-300 ease-out-quint group-hover:translate-x-1 group-hover:text-primary"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /services/:slug ----

/** One service (upgrade 11 §5): plain-language explanation, where it is offered, what to bring. */
export function ServicePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const { slug = "" } = useParams();
  const code = serviceCode(slug);
  const catalogue = useCatalogue(lang);
  const offering = useFacilitiesOffering(code);
  // a service facilities offer but the catalogue has not caught up with still gets its page, named
  // from the facility's own service
  const offered = offering.data?.find((f) => f.service_code === code);
  const service: CatalogueService | undefined =
    catalogue.data?.find((s) => s.code === code) ??
    (offered
      ? {
          code,
          name: pick(offered.service_name_i18n, lang) || code,
          category: categoryOf(code),
          description: "",
        }
      : undefined);

  if (catalogue.isSuccess && offering.isSuccess && !service) {
    return (
      <PublicLayout>
        <PageContainer narrow>
          <NotFoundState
            title={t("site.service.notFound")}
            reason={t("site.service.notFoundReason")}
            back={{ to: "/services", label: t("site.service.allServices") }}
          />
        </PageContainer>
      </PublicLayout>
    );
  }

  // the platform's own words first, then the built-in text for the common services
  const explain =
    service?.description ||
    t(`site.service.explain.${code}`, { defaultValue: "" }) ||
    t("site.service.aboutGeneric");

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[
            { to: "/services", label: t("nav.services") },
            ...(service
              ? [
                  {
                    to: `/services#cat-${service.category}`,
                    label: t(`site.services.categories.${service.category}`),
                  },
                ]
              : []),
            { label: service?.name ?? "…" },
          ]}
          title={service?.name ?? "…"}
          lead={explain}
          actions={
            <Link
              to={`/find-care?q=${encodeURIComponent(service?.name ?? "")}`}
              viewTransition
              className={buttonClassName({ pill: true })}
            >
              {t("site.service.find")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="offering" className="flex min-w-0 flex-col gap-3">
            <h2 id="offering" className="m-0 font-heading text-h2">
              {t("site.service.offering")}
            </h2>
            {offering.isPending ? (
              <FacilityEntries label={t("site.service.offering")} rows={[]} loading />
            ) : offering.isError ? (
              <Panel as="div">
                <ErrorState onRetry={() => void offering.refetch()} />
              </Panel>
            ) : !offering.data?.length ? (
              <Panel as="div">
                <EmptyState
                  title={t("site.service.noneOffering")}
                  action={
                    <Link
                      to="/services"
                      viewTransition
                      className={buttonClassName({ variant: "secondary", pill: true })}
                    >
                      {t("site.service.allServices")}
                    </Link>
                  }
                />
              </Panel>
            ) : (
              <FacilityEntries
                label={t("site.service.offering")}
                rows={offering.data}
                loading={false}
              />
            )}
          </section>
          <aside aria-labelledby="bring" className="flex flex-col gap-3 lg:pt-11">
            <Panel as="div" className="p-6">
              <h2 id="bring" className="m-0 text-h3">
                {t("site.facility.bring.title")}
              </h2>
              <ul className="m-0 mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-secondary">
                <li>{t("site.facility.bring.insurance")}</li>
                <li>{t("site.facility.bring.id")}</li>
                <li>{t("site.facility.bring.documents")}</li>
              </ul>
            </Panel>
          </aside>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}
