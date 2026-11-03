import type { PublicSlot } from "@medilink/api-client";
import { ArrowRight, CalendarCheck, Crosshair, UserCircle } from "@phosphor-icons/react";
import { Button, buttonClassName, cx } from "@medilink/ui";
import { kigaliDate } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { createElement, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PublicLayout } from "../../layout/PublicLayout";
import { DISTRICT_CODES, day, pick, time, type DistrictKey } from "../booking/discovery";
import { FILTER, FilterSelect, TYPES, useNearMe, waitText } from "../booking/Places";
import { FacilityExplorer } from "./FacilityCards";
import {
  categoryIcon,
  doctorsOf,
  parseDoctorSlug,
  SERVICE_CATEGORIES,
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
  LinkRow,
  LoadingRows,
  LocationSelector,
  PageContainer,
  PageHeader,
  Panel,
  SearchBar,
  SectionTitle,
} from "./kit";

const WEEKDAY_BASE = Date.UTC(2024, 0, 1); // a Monday

function weekday(index: number, language: string, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat(language === "rw" ? "en" : language, {
    weekday: style,
    timeZone: "UTC",
  }).format(new Date(WEEKDAY_BASE + index * 86_400_000));
}

const daysText = (days: number[], language: string) =>
  days.length === 7
    ? `${weekday(0, language)}–${weekday(6, language)}`
    : days.map((d) => weekday(d, language)).join(" · ");

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
          crumbs={[{ label: t("nav.facilities") }]}
          title={t("site.facilities.title")}
          lead={t("site.facilities.lead")}
        />
        <div className="flex flex-col gap-6">
          {/* search and every filter in one card above the results */}
          <div className="flex animate-rise flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:p-5">
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

function initialsOf(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** One doctor: initials, name, services, facility, and the seven days with theirs filled. */
function DoctorCard({
  doctor,
  today,
}: {
  doctor: ReturnType<typeof useDoctors>["doctors"][number];
  today: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const here = doctor.days.includes(today);
  return (
    <Link
      to={`/doctors/${doctor.slug}`}
      viewTransition
      className="group flex h-full flex-col gap-4 rounded-3xl border border-border/70 bg-surface p-5 text-fg no-underline transition-[box-shadow,translate,border-color] duration-300 ease-out-quint hover:-translate-y-1 hover:border-brand/40 hover:shadow-raised motion-reduce:hover:translate-y-0"
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-subtle font-heading font-bold text-on-brand-subtle"
        >
          {initialsOf(doctor.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-heading text-h3 leading-snug font-bold">{doctor.name}</span>
          {doctor.specialty && (
            <span className="truncate text-body-sm font-semibold text-brand">
              {doctor.specialty}
            </span>
          )}
          <span className="truncate text-body-sm text-fg-secondary">
            {doctor.services.map((s) => pick(s.name, lang)).join(" · ")}
          </span>
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-body-sm text-fg-muted">
        <UserCircle aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{doctor.facility.name}</span>
      </span>
      <span className="mt-auto flex flex-col gap-2 border-t border-border/60 pt-4">
        <span className="sr-only">
          {t("site.doctors.days")}: {daysText(doctor.days, lang)}
        </span>
        <span aria-hidden="true" className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className={cx(
                "grid h-7 place-items-center rounded-md text-[0.6875rem] font-semibold",
                doctor.days.includes(i)
                  ? "bg-brand-subtle text-on-brand-subtle"
                  : "bg-subtle text-fg-muted/60",
                i === today && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
              )}
            >
              {weekday(i, lang).slice(0, 2)}
            </span>
          ))}
        </span>
        <span className="flex items-center justify-between text-body-sm">
          {here ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
              <span aria-hidden="true" className="ml-live-dot" />
              {t("site.doctors.today")}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-link">
            {t("site.doctors.viewProfile")}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </span>
        </span>
      </span>
    </Link>
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
      (!facility || d.facility.slug === facility) &&
      (!todayOnly || d.days.includes(todayIndex)),
  );

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.doctors") }]}
          title={t("site.doctors.title")}
          lead={t("site.doctors.lead")}
        />
        <div className="flex flex-col gap-6">
          <div className="flex animate-rise flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:p-5">
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
          <Panel as="div" className="overflow-hidden">
            {isPending ? (
              <LoadingRows rows={6} />
            ) : isError ? (
              <ErrorState onRetry={refetch} />
            ) : rows.length === 0 ? (
              <EmptyState title={t("site.doctors.none")} />
            ) : (
              <ul className="m-0 grid list-none gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {rows.map((d, index) => (
                  <li
                    key={d.slug}
                    className="ml-reveal"
                    style={{
                      animationRange: `entry ${(index % 3) * 8}% entry ${55 + (index % 3) * 8}%`,
                    }}
                  >
                    <DoctorCard doctor={d} today={todayIndex} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
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
        <PageContainer narrow className="py-16">
          <EmptyState
            title={t("site.doctor.notFound")}
            action={
              <Link
                to="/doctors"
                viewTransition
                className={buttonClassName({ variant: "secondary", pill: true })}
              >
                {t("nav.doctors")}
              </Link>
            }
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
          <div className="ml-stagger grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <Panel as="aside" className="flex flex-col gap-5 self-start p-6">
              <div className="grid size-16 place-items-center rounded-2xl bg-brand-subtle text-on-brand-subtle">
                <UserCircle aria-hidden="true" className="size-9" />
              </div>
              <dl className="m-0 flex flex-col gap-4">
                <div>
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
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
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
                    {t("site.doctor.worksIn")}
                  </dt>
                  <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                    {doctor.services.map((s) => (
                      <Link
                        key={s.code}
                        to={`/services/${serviceSlug(s.code)}`}
                        viewTransition
                        className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-caption font-semibold text-on-brand-subtle no-underline"
                      >
                        {pick(s.name, lang)}
                      </Link>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
                    {t("site.doctor.presentDays")}
                  </dt>
                  <dd className="m-0 mt-1 font-semibold">{daysText(doctor.days, lang)}</dd>
                </div>
                {doctor.languages.length > 0 && (
                  <div>
                    <dt className="text-caption font-semibold text-fg-muted uppercase">
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
                            <span className="text-caption font-semibold uppercase">
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
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
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

/** Services directory (upgrade 11 §5): the public catalogue, searchable, grouped by category. */
export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const catalogue = useCatalogue(lang);
  const [text, setText] = useState("");
  const words = text.trim().toLowerCase();
  const items = (catalogue.data ?? []).filter(
    (s) => !words || s.name.toLowerCase().includes(words),
  );

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.services") }]}
          title={t("site.services.title")}
          lead={t("site.services.lead")}
        />
        <div className="flex flex-col gap-8">
          <div className="flex animate-rise flex-col gap-4 rounded-3xl bg-surface p-4 shadow-card sm:p-5">
            <SearchBar
              id="service-search"
              label={t("site.services.search")}
              value={text}
              onChange={setText}
              placeholder={t("site.services.search")}
            />
            {/* jump to a category; the page glides there (base.css smooth scrolling) */}
            {!catalogue.isPending && items.length > 0 && (
              <nav aria-label={t("site.services.jump")}>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {SERVICE_CATEGORIES.filter(({ key }) =>
                    items.some((s) => s.category === key),
                  ).map(({ key, icon: CategoryIcon }) => (
                    <li key={key}>
                      <a
                        href={`#cat-${key}`}
                        className="inline-flex min-h-target items-center gap-2 rounded-full border border-border bg-page px-3.5 text-body-sm font-semibold text-fg no-underline transition-colors duration-150 hover:border-primary hover:bg-brand-subtle hover:text-on-brand-subtle"
                      >
                        <CategoryIcon aria-hidden="true" className="size-4 text-primary" />
                        {t(`site.services.categories.${key}`)}
                        <span className="text-caption text-fg-muted tabular-nums">
                          {items.filter((s) => s.category === key).length}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          {catalogue.isPending ? (
            <Panel as="div">
              <LoadingRows rows={5} />
            </Panel>
          ) : catalogue.isError ? (
            <Panel as="div">
              <ErrorState onRetry={() => void catalogue.refetch()} />
            </Panel>
          ) : items.length === 0 ? (
            <Panel as="div">
              <EmptyState title={t("site.services.none")} />
            </Panel>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {SERVICE_CATEGORIES.map(({ key, icon: CategoryIcon }) => {
                const inCategory = items.filter((s) => s.category === key);
                if (!inCategory.length) return null;
                return (
                  <Panel
                    key={key}
                    aria-labelledby={`cat-${key}`}
                    className="scroll-mt-28 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
                      <span
                        aria-hidden="true"
                        className="grid size-10 place-items-center rounded-xl bg-brand-subtle text-primary"
                      >
                        <CategoryIcon weight="duotone" className="size-5" />
                      </span>
                      <h2 id={`cat-${key}`} className="m-0 flex-1 text-h3">
                        {t(`site.services.categories.${key}`)}
                      </h2>
                      <span className="text-body-sm text-fg-muted tabular-nums">
                        {inCategory.length}
                      </span>
                    </div>
                    <ul className="m-0 grid list-none gap-2 p-4 sm:grid-cols-2">
                      {inCategory.map((s) => (
                        <li key={s.code}>
                          <Link
                            to={`/services/${serviceSlug(s.code)}`}
                            viewTransition
                            className="group flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border/60 px-3.5 py-2 text-body-sm font-semibold text-fg no-underline transition-[background-color,border-color] duration-150 hover:border-primary/40 hover:bg-brand-subtle/60"
                          >
                            {s.name}
                            <ArrowRight
                              aria-hidden="true"
                              className="size-4 shrink-0 text-fg-muted transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                );
              })}
            </div>
          )}
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
  const service = catalogue.data?.find((s) => s.code === code);
  const offering = useFacilitiesOffering(service ? code : "");
  const icon = createElement(categoryIcon(service?.category ?? "general"), {
    "aria-hidden": true,
    className: "size-6",
  });

  if (catalogue.isSuccess && !service) {
    return (
      <PublicLayout>
        <PageContainer narrow className="py-16">
          <EmptyState
            title={t("site.service.notFound")}
            action={
              <Link
                to="/services"
                viewTransition
                className={buttonClassName({ variant: "secondary", pill: true })}
              >
                {t("nav.services")}
              </Link>
            }
          />
        </PageContainer>
      </PublicLayout>
    );
  }

  const explain =
    t(`site.service.explain.${code}`, { defaultValue: "" }) || t("site.service.aboutGeneric");

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ to: "/services", label: t("nav.services") }, { label: service?.name ?? "…" }]}
          eyebrow={service ? t(`site.services.categories.${service.category}`) : undefined}
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
        <div className="ml-stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel aria-labelledby="offering" className="overflow-hidden">
            <h2 id="offering" className="m-0 border-b border-border/60 px-5 py-4 text-h3">
              {t("site.service.offering")}
            </h2>
            {offering.isPending ? (
              <LoadingRows rows={3} />
            ) : offering.isError ? (
              <ErrorState onRetry={() => void offering.refetch()} />
            ) : !offering.data?.length ? (
              <EmptyState title={t("site.service.noneOffering")} />
            ) : (
              <ul className="m-0 list-none p-0">
                {offering.data.map((r) => (
                  <LinkRow
                    key={r.slug}
                    to={`/facilities/${r.slug}`}
                    title={r.name}
                    detail={`${t(`booking.types.${r.type}`, { defaultValue: r.type })} · ${r.district}`}
                    meta={waitText(r, t, lang) || (r.open_now ? t("site.open") : t("site.closed"))}
                  />
                ))}
              </ul>
            )}
          </Panel>
          <Panel as="aside" className="flex flex-col gap-4 self-start p-6">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-subtle text-on-brand-subtle">
              {icon}
            </span>
            <h2 className="m-0 text-h3">{t("site.facility.bring.title")}</h2>
            <ul className="m-0 flex flex-col gap-2 pl-5 text-fg-secondary">
              <li>{t("site.facility.bring.insurance")}</li>
              <li>{t("site.facility.bring.id")}</li>
              <li>{t("site.facility.bring.documents")}</li>
            </ul>
          </Panel>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}
