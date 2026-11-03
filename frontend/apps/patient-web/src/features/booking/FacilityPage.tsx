import type { PublicFacility, PublicService } from "@medilink/api-client";
import {
  CalendarPlus,
  Clock,
  MapPin,
  NavigationArrow,
  PersonSimpleWalk,
  Phone,
  SealCheck,
  Siren,
  UserCircle,
} from "@phosphor-icons/react";
import {
  buttonClassName,
  cx,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@medilink/ui";
import { dateFormat, kigaliDate } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { env } from "../../env";
import { PublicLayout } from "../../layout/PublicLayout";
import { doctorSlug, EMERGENCY, isHospital, serviceSlug } from "../site/data";
import {
  EmptyState,
  FacilityStatus,
  InsuranceList,
  PageContainer,
  PageHeader,
  Panel,
  WaitingTime,
} from "../site/kit";
import { day, directionsUrl, pick, pinKind, time } from "./discovery";
import { rememberPlace } from "./recent";

const FacilityMap = lazy(() => import("@medilink/ui/map"));

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function weekdayName(index: number, language: string): string {
  // 2024-01-01 was a Monday
  return dateFormat(language, { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  );
}

/** Join today's queue where a service allows it, otherwise book; nothing if neither. */
function primaryAction(f: PublicFacility, wanted: string | null) {
  const ordered = [...f.services].sort(
    (a, b) =>
      Number(b.code === wanted || b.id === wanted) - Number(a.code === wanted || a.id === wanted),
  );
  const join = ordered.find((s) => s.remote_join);
  if (join) return { kind: "join" as const, to: `/book/${f.slug}?service=${join.id}&today=1` };
  const book = ordered.find((s) => s.bookable);
  if (book) return { kind: "book" as const, to: `/book/${f.slug}?service=${book.id}` };
  return null;
}

/**
 * Facility profile (upgrade 11 §5): header with type, place, verified (only when true), open
 * status and directions; the **Today** panel (hours, live wait, queue and booking, insurers,
 * hospital note); tabs Overview · Services · Doctors · Insurance · Hours & Location; what to
 * bring. The primary action follows real availability. No prices (U-01). Public.
 */
export function FacilityPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const [now] = useState(() => Date.now());
  const facility = useQuery({
    queryKey: ["discovery", "facility", slug],
    queryFn: () => api.booking.facility(slug),
  });
  const name = facility.data?.name;
  useEffect(() => {
    if (name) rememberPlace({ slug, name });
  }, [slug, name]);

  if (facility.isPending)
    return (
      <PublicLayout>
        <PageContainer className="flex flex-col gap-4 py-10">
          <Skeleton className="h-6 w-48 rounded-md" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
          <Skeleton className="h-48 rounded-3xl" />
        </PageContainer>
      </PublicLayout>
    );
  if (facility.isError || !facility.data)
    return (
      <PublicLayout>
        <PageContainer narrow className="py-16">
          <EmptyState
            title={t("site.facility.notFound")}
            action={
              <Link
                to="/facilities"
                viewTransition
                className={buttonClassName({ variant: "secondary", pill: true })}
              >
                {t("site.facility.back")}
              </Link>
            }
          />
        </PageContainer>
      </PublicLayout>
    );

  const f = facility.data;
  const action = primaryAction(f, params.get("service"));
  const directions = f.lat !== null && f.lng !== null ? directionsUrl(f.lat, f.lng) : null;
  const byDay = new Map(f.hours.map(([date, open, close]) => [date, `${open}–${close}`]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const iso = kigaliDate(new Date(now + i * 86_400_000));
    return { iso, hours: byDay.get(iso) ?? null };
  });
  const todayHours = week[0]?.hours ?? null;
  const live = f.services.filter((s) => s.waiting !== null && s.waiting !== undefined);
  const insurers = [...new Set(f.services.flatMap((s) => s.insurers))].sort();
  const hospital = isHospital(f.type);
  const place = [f.sector, f.district].filter(Boolean).join(", ");

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ to: "/facilities", label: t("nav.facilities") }, { label: f.name }]}
          title={f.name}
          lead={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{t(`booking.types.${f.type}`, { defaultValue: f.type })}</span>
              {place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" className="size-4" />
                  {place}
                </span>
              )}
              <FacilityStatus open={f.open_now} />
              {f.verified && (
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                  <SealCheck aria-hidden="true" weight="fill" className="size-4" />
                  {t("site.facility.verified")}
                </span>
              )}
            </span>
          }
          actions={
            <>
              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClassName({ variant: "secondary", pill: true })}
                >
                  <NavigationArrow aria-hidden="true" className="size-4" />
                  {t("site.facility.directions")}
                  <span className="sr-only"> {t("common.opensInNewTab")}</span>
                </a>
              )}
              {action && (
                <Link to={action.to} viewTransition className={buttonClassName({ pill: true })}>
                  {action.kind === "join" ? (
                    <PersonSimpleWalk aria-hidden="true" className="size-4" />
                  ) : (
                    <CalendarPlus aria-hidden="true" className="size-4" />
                  )}
                  {action.kind === "join"
                    ? t("site.facility.joinQueue")
                    : t("site.facility.bookAppointment")}
                </Link>
              )}
            </>
          }
        />

        <div className="ml-stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Today: the most important part of the page */}
            <Panel aria-labelledby="today" className="p-6 sm:p-7">
              <h2 id="today" className="m-0 flex items-center gap-2 text-h2 tracking-tight">
                {t("site.facility.today")}
                {live.length > 0 && (
                  <span aria-hidden="true" className="ml-live-dot text-success" />
                )}
              </h2>
              <dl className="m-0 mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-3">
                <div>
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
                    {t("site.facility.hoursToday")}
                  </dt>
                  <dd className="m-0 mt-1 font-heading text-h3 font-bold tabular-nums">
                    {todayHours ?? t("site.facility.closedToday")}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
                    {t("site.facility.queue")}
                  </dt>
                  <dd className="m-0 mt-1 font-semibold">
                    {f.services.some((s) => s.remote_join || s.walk_in)
                      ? t("site.facility.available")
                      : t("site.facility.notAvailable")}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption font-semibold text-fg-muted uppercase">
                    {t("site.facility.booking")}
                  </dt>
                  <dd className="m-0 mt-1 font-semibold">
                    {f.services.some((s) => s.bookable)
                      ? t("site.facility.available")
                      : t("site.facility.notAvailable")}
                  </dd>
                </div>
              </dl>
              <div className="mt-6 border-t border-border/60 pt-5">
                <h3 className="m-0 text-caption font-semibold text-fg-muted uppercase">
                  {t("site.facility.liveWait")}
                </h3>
                {live.length === 0 ? (
                  <p className="m-0 mt-1 text-fg-secondary">{t("site.facility.waitUnknown")}</p>
                ) : (
                  <ul className="m-0 mt-2 flex list-none flex-col p-0">
                    {live.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2.5 last:border-b-0"
                      >
                        <span className="font-semibold">{pick(s.name_i18n, lang)}</span>
                        <WaitingTime result={s} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-5 flex flex-col gap-2 border-t border-border/60 pt-5">
                <h3 className="m-0 text-caption font-semibold text-fg-muted uppercase">
                  {t("site.facility.insurance")}
                </h3>
                <InsuranceList codes={insurers} />
              </div>
              {hospital && (
                <p className="m-0 mt-5 flex items-start gap-2 rounded-2xl bg-danger-bg p-4 text-body-sm text-fg">
                  <Siren
                    aria-hidden="true"
                    weight="bold"
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  {t("site.facility.emergencyNote", { number: EMERGENCY.number })}
                </p>
              )}
            </Panel>

            <Tabs defaultValue="overview" className="flex flex-col">
              <TabsList
                aria-label={t("site.facility.tabs.label")}
                className="flex-nowrap overflow-x-auto border-border/70"
              >
                {(["overview", "services", "doctors", "insurance", "hours"] as const).map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="text-body-sm whitespace-nowrap transition-colors duration-150 ease-out-quint"
                  >
                    {t(`site.facility.tabs.${key}`)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="animate-enter">
                <Panel as="div" className="flex flex-col gap-5 p-6">
                  <div>
                    <h3 className="m-0 text-h3">{t("site.facility.about")}</h3>
                    <p className="m-0 mt-2 text-fg-secondary">
                      {pick(f.description_i18n, lang) || t("site.facility.noDescription")}
                    </p>
                  </div>
                  <Contact f={f} />
                </Panel>
              </TabsContent>

              <TabsContent value="services" className="animate-enter">
                <Panel as="div" className="overflow-hidden">
                  {f.services.length === 0 ? (
                    <EmptyState title={t("site.facility.noServices")} />
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {f.services.map((s) => (
                        <ServiceRow key={s.id} slug={f.slug} service={s} />
                      ))}
                    </ul>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="doctors" className="animate-enter">
                <Panel as="div" className="overflow-hidden">
                  {f.doctors.length === 0 ? (
                    <EmptyState title={t("site.facility.noDoctors")} />
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {f.doctors.map((d) => (
                        <li
                          key={d.membership_id}
                          className="border-b border-border/50 last:border-b-0"
                        >
                          <Link
                            to={`/doctors/${doctorSlug(f.slug, d.membership_id)}`}
                            viewTransition
                            className="flex items-center gap-4 px-5 py-4 text-fg no-underline transition-colors duration-200 ease-out-quint hover:bg-subtle/60"
                          >
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
                              <UserCircle aria-hidden="true" className="size-6" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="font-semibold">{d.name}</span>
                              <span className="text-body-sm text-fg-secondary">
                                {f.services
                                  .filter((s) => d.service_ids.includes(s.id))
                                  .map((s) => pick(s.name_i18n, lang))
                                  .join(" · ")}
                              </span>
                            </span>
                            <span className="hidden text-body-sm text-fg-muted sm:block">
                              {WEEKDAYS.filter((w) => d.days.includes(w))
                                .map((w) => weekdayName(w, lang))
                                .join(" · ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="insurance" className="animate-enter">
                <Panel as="div" className="flex flex-col gap-4 p-6">
                  <p className="m-0 text-fg-secondary">{t("site.facility.insuranceLead")}</p>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {f.services.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-3 last:border-b-0"
                      >
                        <span className="font-semibold">{pick(s.name_i18n, lang)}</span>
                        <InsuranceList codes={s.insurers} />
                      </li>
                    ))}
                  </ul>
                  {f.level_of_care !== "primary" && (
                    <p className="m-0 rounded-2xl bg-info-bg p-4 text-body-sm text-fg">
                      {t("site.facility.referral")}
                    </p>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="hours" className="animate-enter">
                <div className="grid gap-6 md:grid-cols-2">
                  <Panel as="div" className="flex flex-col gap-3 p-6">
                    <h3 className="m-0 text-h3">{t("site.facility.week")}</h3>
                    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                      {week.map(({ iso, hours }, index) => (
                        <div key={iso} className="contents">
                          <dt
                            className={cx("first-letter:uppercase", index === 0 && "font-semibold")}
                          >
                            {day(iso, lang, "short")}
                          </dt>
                          <dd
                            className={cx("m-0 text-right tabular-nums", !hours && "text-fg-muted")}
                          >
                            {hours ?? t("site.closed")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <h3 className="m-0 mt-3 text-body-sm font-semibold text-fg-muted">
                      {t("site.facility.closures")}
                    </h3>
                    <p className="m-0 text-body-sm text-fg-secondary">
                      {f.closures.length
                        ? f.closures.map((c) => day(c.date, lang, "short")).join(", ")
                        : t("site.facility.noClosures")}
                    </p>
                  </Panel>
                  <Panel as="div" className="flex flex-col gap-4 p-6">
                    <Contact f={f} />
                    {f.lat !== null && f.lng !== null && (
                      <Suspense fallback={<Skeleton className="h-56 rounded-2xl" />}>
                        <FacilityMap
                          points={[
                            {
                              id: f.slug,
                              lat: f.lat,
                              lng: f.lng,
                              kind: pinKind(f.type),
                              load: null,
                              label: f.name,
                            },
                          ]}
                          selectedId={f.slug}
                          tilesUrl={env.mapTilesUrl}
                          attribution={t("home.mapAttribution")}
                          label={t("site.facility.map")}
                          className="h-56"
                        />
                      </Suspense>
                    )}
                  </Panel>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="flex flex-col gap-6">
            <Panel aria-labelledby="bring" className="p-6">
              <h2 id="bring" className="m-0 text-h3">
                {t("site.facility.bring.title")}
              </h2>
              <ul className="m-0 mt-3 flex flex-col gap-2 pl-5 text-fg-secondary">
                <li>{t("site.facility.bring.insurance")}</li>
                <li>{t("site.facility.bring.id")}</li>
                {f.level_of_care !== "primary" && <li>{t("site.facility.bring.referral")}</li>}
                <li>{t("site.facility.bring.documents")}</li>
              </ul>
            </Panel>
            {todayHours && (
              <Panel as="div" className="flex items-center gap-3 p-6">
                <Clock aria-hidden="true" className="size-6 text-primary" />
                <span>
                  <span className="block text-caption font-semibold text-fg-muted uppercase">
                    {t("site.facility.hoursToday")}
                  </span>
                  <span className="font-semibold tabular-nums">{todayHours}</span>
                </span>
              </Panel>
            )}
          </aside>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

function Contact({ f }: { f: PublicFacility }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="m-0 text-h3">{t("site.facility.contact")}</h3>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-fg-muted">{t("site.facility.address")}</dt>
        <dd className="m-0">{f.address || t("site.facility.notListed")}</dd>
        <dt className="text-fg-muted">{t("site.facility.phone")}</dt>
        <dd className="m-0">
          {f.phone ? (
            <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1.5 font-semibold">
              <Phone aria-hidden="true" className="size-4" />
              {f.phone}
            </a>
          ) : (
            t("site.facility.notListed")
          )}
        </dd>
      </dl>
    </div>
  );
}

function ServiceRow({ slug, service }: { slug: string; service: PublicService }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const modes = [
    service.walk_in && t("site.facility.walkIn"),
    service.bookable && t("site.facility.appointment"),
    service.remote_join && t("site.facility.remote"),
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/services/${serviceSlug(service.code)}`}
          viewTransition
          className="font-semibold text-fg no-underline hover:underline"
        >
          {pick(service.name_i18n, lang)}
        </Link>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
          <span>{modes.join(" · ")}</span>
          <WaitingTime result={service} />
          {service.next_slot_at && (
            <span>
              {t("site.facility.nextTime", {
                day: day(service.next_slot_at, lang, "short"),
                time: time(service.next_slot_at, lang),
              })}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {service.remote_join && (
          <Link
            to={`/book/${slug}?service=${service.id}&today=1`}
            viewTransition
            className={buttonClassName({ size: "sm", pill: true })}
          >
            {t("site.facility.joinQueue")}
          </Link>
        )}
        {service.bookable && (
          <Link
            to={`/book/${slug}?service=${service.id}`}
            viewTransition
            className={buttonClassName({
              size: "sm",
              pill: true,
              variant: service.remote_join ? "secondary" : "primary",
            })}
          >
            {t("site.facility.bookAppointment")}
          </Link>
        )}
      </div>
    </li>
  );
}
