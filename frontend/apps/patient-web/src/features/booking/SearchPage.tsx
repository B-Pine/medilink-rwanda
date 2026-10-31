import type { FacilityResult, FacilitySearchInput, QueueLoad } from "@medilink/api-client";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle,
  Clock,
  Crosshair,
  Gauge,
  Info,
  MagnifyingGlass,
  MapPin,
  SealCheck,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  cx,
  EmptyState,
  ImigongoPattern,
  SelectField,
  Skeleton,
} from "@medilink/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";
import {
  day,
  DISTRICT_CODES,
  DISTRICT_KEYS,
  INSURER_CODES,
  INSURER_KEYS,
  pick,
  rwf,
  SERVICE_CODES,
  SERVICE_KEYS,
  field,
  searchUrl,
  time,
  type DistrictKey,
  type InsurerKey,
  type ServiceKey,
} from "./discovery";

const LOAD_TONE: Record<QueueLoad, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-danger",
};

export function LoadBadge({ load }: { load: QueueLoad | null }) {
  const { t } = useTranslation();
  if (!load) return null;
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-semibold", LOAD_TONE[load])}>
      <Gauge aria-hidden="true" weight="bold" className="size-5" />
      {t(`booking.load.${load}`)}
    </span>
  );
}

function InsuranceLine({ result, insurer }: { result: FacilityResult; insurer: string }) {
  const { t } = useTranslation();
  if (result.accepts_insurance === "unknown") return null;
  const name = t(`landing.insurers.${insurer}`);
  return result.accepts_insurance === "yes" ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-success">
      <CheckCircle aria-hidden="true" weight="fill" className="size-5" />
      {t("booking.search.accepts", { insurer: name })}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-fg-muted">
      <XCircle aria-hidden="true" className="size-5" />
      {t("booking.search.notAccepted", { insurer: name })}
    </span>
  );
}

export function FacilityCard({
  result,
  insurerKey,
}: {
  result: FacilityResult;
  insurerKey: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const share =
    result.patient_share_rwf !== null && result.patient_share_rwf !== result.fee_rwf
      ? result.patient_share_rwf
      : null;
  return (
    <article
      aria-labelledby={`fac-${result.slug}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-raised sm:flex-row sm:items-stretch"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={`fac-${result.slug}`} className="m-0 text-h3">
            <Link
              to={`/facilities/${result.slug}`}
              className="text-fg no-underline hover:underline"
            >
              {result.name}
            </Link>
          </h2>
          <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-brand">
            <SealCheck aria-hidden="true" weight="fill" className="size-4" />
            {t("booking.verified")}
          </span>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
          <span>{t(`booking.types.${result.type}`, { defaultValue: result.type })}</span>
          {(result.sector || result.district || result.distance_km !== null) && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-4" />
              {[result.sector, result.district].filter(Boolean).join(", ")}
              {result.distance_km !== null &&
                ` · ${t("booking.search.km", { km: result.distance_km })}`}
            </span>
          )}
          <Badge tone={result.open_now ? "success" : "neutral"}>
            {result.open_now ? t("booking.openNow") : t("booking.closedNow")}
          </Badge>
        </p>
        <p className="m-0 text-fg">{pick(result.service_name_i18n, lang)}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm">
          <InsuranceLine result={result} insurer={insurerKey} />
          <LoadBadge load={result.queue_load} />
        </div>
        {result.referral_hint && (
          <p className="m-0 flex items-start gap-2 rounded-md bg-info-bg px-3 py-2 text-body-sm text-fg">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
            {t("booking.referralHint")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col justify-between gap-3 border-t border-border pt-4 sm:w-56 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        <div className="flex flex-col gap-0.5">
          {result.fee_rwf !== null && (
            <>
              <span className="text-body-sm text-fg-muted">
                {share !== null ? t("booking.yourShare") : t("booking.fee")}
              </span>
              <span className="font-heading text-h2 tabular-nums">
                {rwf(share ?? result.fee_rwf, lang)}
              </span>
              {share !== null && (
                <span className="text-body-sm text-fg-muted line-through tabular-nums">
                  {rwf(result.fee_rwf, lang)}
                </span>
              )}
            </>
          )}
        </div>
        {result.next_slot_at ? (
          <p className="m-0 flex items-center gap-1.5 text-body-sm font-semibold text-fg">
            <CalendarCheck aria-hidden="true" className="size-5 text-brand" />
            {t("booking.search.next", {
              day: day(result.next_slot_at, lang, "short"),
              time: time(result.next_slot_at, lang),
            })}
          </p>
        ) : (
          <p className="m-0 flex items-center gap-1.5 text-body-sm text-fg-muted">
            <Clock aria-hidden="true" className="size-5" />
            {t("booking.search.walkInOnly")}
          </p>
        )}
        <Link
          to={`/facilities/${result.slug}?service=${result.service_code}`}
          className={buttonClassName({ fullWidth: true })}
        >
          {result.next_slot_at ? t("booking.search.book") : t("booking.search.view")}
          <ArrowRight aria-hidden="true" className="size-icon" />
        </Link>
      </div>
    </article>
  );
}

const FILTERS = ["open_now", "available_today"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Search results (design 06 §4, FR-SCH-01): the search box stays on top; filters are removable
 * chips; cards show distance, open now, insurance, your share, next time and queue load. The
 * location is asked only on "Use my location" and kept in memory, never in the URL (D-2).
 */
export function SearchPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const service = (params.get("service") ?? "") as ServiceKey | "";
  const district = (params.get("district") ?? "") as DistrictKey | "";
  const insurer = (params.get("insurer") ?? "") as InsurerKey | "";
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");

  const body: FacilitySearchInput = {
    service_code: service ? SERVICE_CODES[service] : undefined,
    district_code: district ? DISTRICT_CODES[district] : undefined,
    insurer_code: insurer ? INSURER_CODES[insurer] || undefined : undefined,
    open_now: filters.has("open_now"),
    available_today: filters.has("available_today"),
    near,
  };
  const results = useQuery({
    queryKey: ["discovery", "search", body],
    queryFn: () => api.booking.search(body),
    placeholderData: keepPreviousData,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void navigate(
      searchUrl({
        service: field(form, "service"),
        district: field(form, "district"),
        insurer: field(form, "insurer"),
      }),
    );
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("denied"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };

  const toggle = (filter: Filter) =>
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(service
      ? [
          {
            key: "service",
            label: t(`landing.services.${service}`),
            remove: () => void navigate(searchUrl({ district, insurer })),
          },
        ]
      : []),
    ...(district
      ? [
          {
            key: "district",
            label: t(`landing.districts.${district}`),
            remove: () => void navigate(searchUrl({ service, insurer })),
          },
        ]
      : []),
    ...(insurer
      ? [
          {
            key: "insurer",
            label: t(`landing.insurers.${insurer}`),
            remove: () => void navigate(searchUrl({ service, district })),
          },
        ]
      : []),
    ...(near
      ? [{ key: "near", label: t("booking.search.nearMe"), remove: () => setNear(null) }]
      : []),
  ];
  const data = results.data;

  return (
    <PublicLayout>
      <section className="relative isolate overflow-hidden bg-forest text-on-forest">
        <ImigongoPattern opacity={0.06} className="-z-10" />
        <div className="mx-auto flex max-w-[70rem] flex-col gap-4 px-4 py-8 sm:px-6">
          <PageHeading title={t("booking.search.title")} className="text-h1 text-on-forest">
            {t("booking.search.title")}
          </PageHeading>
          <form
            onSubmit={onSubmit}
            aria-label={t("landing.search.title")}
            className="grid gap-3 rounded-lg bg-surface p-4 text-fg shadow-raised md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end"
          >
            <SelectField
              key={`s-${service}`}
              name="service"
              label={t("landing.search.service")}
              defaultValue={service}
            >
              <option value="">{t("landing.search.serviceAny")}</option>
              {SERVICE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`landing.services.${key}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              key={`d-${district}`}
              name="district"
              label={t("landing.search.location")}
              defaultValue={district}
            >
              <option value="">{t("landing.search.locationAny")}</option>
              {DISTRICT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`landing.districts.${key}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              key={`i-${insurer}`}
              name="insurer"
              label={t("landing.search.insurance")}
              defaultValue={insurer}
            >
              <option value="">{t("landing.search.insuranceAny")}</option>
              {INSURER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`landing.insurers.${key}`)}
                </option>
              ))}
            </SelectField>
            <Button
              type="submit"
              size="lg"
              iconStart={<MagnifyingGlass aria-hidden="true" className="size-icon" />}
            >
              {t("landing.search.submit")}
            </Button>
          </form>
        </div>
      </section>

      <div className="mx-auto flex max-w-[70rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={filters.has(filter)}
              onClick={() => toggle(filter)}
              className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {t(`booking.search.filters.${filter}`)}
            </button>
          ))}
          <Button
            variant="ghost"
            onClick={locate}
            loading={locating === "busy"}
            iconStart={<Crosshair aria-hidden="true" className="size-icon" />}
          >
            {t("booking.search.useLocation")}
          </Button>
        </div>
        {locating === "denied" && <Alert tone="info">{t("booking.search.locationDenied")}</Alert>}
        {chips.length > 0 && (
          <ul
            aria-label={t("booking.search.active")}
            className="m-0 flex list-none flex-wrap gap-2 p-0"
          >
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={chip.remove}
                  aria-label={t("booking.search.remove", { label: chip.label })}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-brand-subtle px-3 text-body-sm font-semibold text-on-brand-subtle hover:bg-subtle"
                >
                  {chip.label}
                  <X aria-hidden="true" weight="bold" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p role="status" className="m-0 font-semibold text-fg-secondary">
          {data ? t("booking.search.count", { count: data.count }) : ""}
        </p>
        {results.isPending ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="10rem" className="rounded-lg" />
            ))}
          </div>
        ) : results.isError ? (
          <Alert tone="danger" role="alert" title={t("booking.search.failed")}>
            <Button variant="secondary" onClick={() => void results.refetch()}>
              {t("common.retry")}
            </Button>
          </Alert>
        ) : data && data.results.length === 0 ? (
          <EmptyState
            icon={MagnifyingGlass}
            title={t("booking.search.noneTitle")}
            description={t("booking.search.noneBody")}
            action={
              <Link to="/search" className={buttonClassName({ variant: "secondary" })}>
                {t("booking.search.clear")}
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {data?.results.map((result) => (
              <FacilityCard key={result.slug} result={result} insurerKey={insurer} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
