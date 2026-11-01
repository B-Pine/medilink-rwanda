import type { PublicService } from "@medilink/api-client";
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  Info,
  MapPin,
  NavigationArrow,
  Phone,
  PersonSimpleWalk,
  SealCheck,
  Stethoscope,
} from "@phosphor-icons/react";
import {
  Alert,
  buttonClassName,
  Card,
  cx,
  EmptyState,
  ImigongoPattern,
  LoadingState,
} from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";
import { day, pick, rwf, time } from "./discovery";
import { LoadBadge } from "./SearchPage";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function weekdayName(index: number, language: string): string {
  // 2024-01-01 was a Monday
  return dateFormat(language, { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  );
}

function ServiceRow({ slug, service }: { slug: string; service: PublicService }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="m-0 text-h3">{pick(service.name_i18n, lang)}</h3>
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-fg-secondary">
          {service.fee_rwf !== null && (
            <span className="font-semibold text-fg tabular-nums">{rwf(service.fee_rwf, lang)}</span>
          )}
          <LoadBadge load={service.queue_load} />
          {service.next_slot_at && (
            <span>
              {t("booking.search.next", {
                day: day(service.next_slot_at, lang, "short"),
                time: time(service.next_slot_at, lang),
              })}
            </span>
          )}
        </p>
        {service.insurers.length > 0 && (
          <p className="m-0 text-body-sm text-fg-muted">
            {t("booking.facility.insurers", {
              list: service.insurers
                .map((code) => t(`booking.insurerNames.${code}`, { defaultValue: code }))
                .join(", "),
            })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {service.bookable && (
          <Link
            to={`/book/${slug}?service=${service.id}`}
            className={buttonClassName({ size: "md" })}
          >
            <CalendarPlus aria-hidden="true" className="size-icon" />
            {t("booking.facility.book")}
          </Link>
        )}
        {service.remote_join && (
          <Link
            to={`/book/${slug}?service=${service.id}&today=1`}
            className={buttonClassName({ size: "md", variant: "secondary" })}
          >
            <PersonSimpleWalk aria-hidden="true" className="size-icon" />
            {t("booking.facility.join")}
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Facility profile (design 06 §4, FR-SCH-02, 03): verified header with open now and the two
 * actions, services with fees, insurers, queue load and next time, doctors and their days, this
 * week's hours and closures, the address with a directions link. Public; no account needed.
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

  if (facility.isPending)
    return (
      <PublicLayout>
        <LoadingState className="min-h-[50vh]" />
      </PublicLayout>
    );
  if (facility.isError || !facility.data)
    return (
      <PublicLayout narrow>
        <EmptyState
          icon={MapPin}
          title={t("booking.facility.notFound")}
          description={t("booking.facility.notFoundBody")}
          action={
            <Link to="/search" className={buttonClassName({})}>
              {t("booking.facility.backToSearch")}
            </Link>
          }
        />
      </PublicLayout>
    );

  const f = facility.data;
  const wanted = params.get("service");
  const services = [...f.services].sort(
    (a, b) => Number(b.code === wanted) - Number(a.code === wanted),
  );
  const primary = services.find((s) => s.bookable) ?? services[0];
  const directions =
    f.lat !== null && f.lng !== null
      ? `https://www.openstreetmap.org/directions?to=${f.lat}%2C${f.lng}`
      : null;
  const byDay = new Map(f.hours.map(([date, open, close]) => [date, `${open}–${close}`]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now + i * 86_400_000);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(date);
    return { iso, hours: byDay.get(iso) ?? null };
  });

  return (
    <PublicLayout>
      <section className="relative isolate overflow-hidden bg-forest text-on-forest">
        <ImigongoPattern opacity={0.06} className="-z-10" />
        <div className="mx-auto flex max-w-[70rem] flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
          <Link
            to="/search"
            className="inline-flex w-fit items-center gap-2 rounded-sm font-semibold text-on-forest-accent no-underline hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-icon" />
            {t("booking.facility.backToSearch")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <PageHeading title={f.name} className="text-display text-on-forest">
              {f.name}
            </PageHeading>
            {f.verified && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-raised px-3 py-1 text-body-sm font-semibold text-on-forest-accent">
                <SealCheck aria-hidden="true" weight="fill" className="size-5" />
                {t("booking.verified")}
              </span>
            )}
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-on-forest-muted">
            <span>{t(`booking.types.${f.type}`, { defaultValue: f.type })}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-5" />
              {[f.sector, f.district].filter(Boolean).join(", ")}
            </span>
            <span
              className={cx(
                "inline-flex items-center gap-1 font-semibold",
                f.open_now ? "text-on-forest-accent" : "text-on-forest-muted",
              )}
            >
              <Clock aria-hidden="true" className="size-5" />
              {f.open_now ? t("booking.openNow") : t("booking.closedNow")}
            </span>
          </p>
          {pick(f.description_i18n, lang) && (
            <p className="m-0 max-w-[44rem] text-on-forest-muted">
              {pick(f.description_i18n, lang)}
            </p>
          )}
          {primary && (
            <div className="flex flex-wrap gap-3 pt-2">
              {primary.bookable && (
                <Link
                  to={`/book/${f.slug}?service=${primary.id}`}
                  className={buttonClassName({ size: "lg" })}
                >
                  <CalendarPlus aria-hidden="true" className="size-icon" />
                  {t("booking.facility.book")}
                </Link>
              )}
              {f.services.some((s) => s.remote_join) && (
                <Link
                  to={`/book/${f.slug}?service=${f.services.find((s) => s.remote_join)!.id}&today=1`}
                  className={buttonClassName({ size: "lg", variant: "secondary" })}
                >
                  <PersonSimpleWalk aria-hidden="true" className="size-icon" />
                  {t("booking.facility.join")}
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-[70rem] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {f.level_of_care !== "primary" && (
            <Alert tone="info" title={t("booking.referralTitle")}>
              {t("booking.referralHint")}
            </Alert>
          )}
          <Card as="section" aria-labelledby="fac-services" className="flex flex-col">
            <h2 id="fac-services" className="m-0 text-h2">
              {t("booking.facility.services")}
            </h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {services.map((s) => (
                <ServiceRow key={s.id} slug={f.slug} service={s} />
              ))}
            </ul>
          </Card>
          {f.doctors.length > 0 && (
            <Card as="section" aria-labelledby="fac-doctors" className="flex flex-col gap-3">
              <h2 id="fac-doctors" className="m-0 text-h2">
                {t("booking.facility.doctors")}
              </h2>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {f.doctors.map((d) => (
                  <li
                    key={d.membership_id}
                    className="flex items-start gap-3 rounded-md bg-subtle p-3"
                  >
                    <Stethoscope
                      aria-hidden="true"
                      weight="duotone"
                      className="size-7 shrink-0 text-brand"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-semibold">{d.name}</span>
                      <span
                        className="flex flex-wrap gap-1"
                        aria-label={t("booking.facility.days")}
                      >
                        {WEEKDAYS.filter((w) => d.days.includes(w)).map((w) => (
                          <span
                            key={w}
                            className="rounded-full bg-surface px-2.5 py-0.5 text-body-sm font-semibold"
                          >
                            {weekdayName(w, lang)}
                          </span>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <aside className="flex flex-col gap-6">
          <Card as="section" aria-labelledby="fac-hours" className="flex flex-col gap-3">
            <h2 id="fac-hours" className="m-0 text-h3">
              {t("booking.facility.hours")}
            </h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {week.map(({ iso, hours }) => (
                <div key={iso} className="contents">
                  <dt className="first-letter:uppercase">{day(iso, lang, "short")}</dt>
                  <dd className={cx("m-0 text-right tabular-nums", !hours && "text-fg-muted")}>
                    {hours ?? t("booking.facility.closed")}
                  </dd>
                </div>
              ))}
            </dl>
            {f.closures.length > 0 && (
              <p className="m-0 flex items-start gap-2 text-body-sm text-fg-secondary">
                <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {t("booking.facility.closures", {
                  list: f.closures.map((c) => day(c.date, lang, "short")).join(", "),
                })}
              </p>
            )}
          </Card>
          <Card as="section" aria-labelledby="fac-contact" className="flex flex-col gap-3">
            <h2 id="fac-contact" className="m-0 text-h3">
              {t("booking.facility.contact")}
            </h2>
            {f.address && (
              <p className="m-0 flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                {f.address}
              </p>
            )}
            {f.phone && (
              <a href={`tel:${f.phone}`} className="flex items-center gap-2 font-semibold">
                <Phone aria-hidden="true" className="size-5 text-fg-muted" />
                {f.phone}
              </a>
            )}
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName({ variant: "secondary", fullWidth: true })}
              >
                <NavigationArrow aria-hidden="true" className="size-icon" />
                {t("booking.facility.directions")}
                <span className="sr-only"> {t("common.opensInNewTab")}</span>
              </a>
            )}
          </Card>
        </aside>
      </div>
    </PublicLayout>
  );
}
