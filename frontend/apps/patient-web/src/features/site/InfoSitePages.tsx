import { ApiError } from "@medilink/api-client";
import {
  ArrowRight,
  ChatCircleText,
  Crosshair,
  NavigationArrow,
  Phone,
  Siren,
} from "@phosphor-icons/react";
import { Alert, Button, buttonClassName, cx, TextareaField, TextField } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PublicLayout } from "../../layout/PublicLayout";
import { directionsUrl, pick } from "../booking/discovery";
import { sortResults, useNearMe } from "../booking/Places";
import { EMERGENCY, isHospital, mapSearchUrl, REFERRAL_HOSPITALS } from "./data";
import {
  EmptyState,
  Faq,
  LinkRow,
  LoadingRows,
  PageContainer,
  PageHeader,
  Panel,
  SearchBar,
} from "./kit";

/** Date shown on the legal and information documents (upgrade 11 §5). */
const DOCS_UPDATED = "2026-11-02";

/**
 * Legal text still carries "[To confirm]" markers for the legal review in the locale files; the
 * public page never shows draft markers (redesign: no draft content on public pages), nor the
 * holes they leave: a marker in brackets goes with its brackets, one opening a sentence goes
 * alone, and a sentence that only makes sense with the missing fact (a contact "at [To confirm]")
 * is left out until the fact is confirmed.
 */
function Confirm({ children }: { children: string }) {
  return <>{withoutDraftMarkers(children)}</>;
}

const MARKER = "[To confirm]";

function withoutDraftMarkers(text: string): string {
  return text
    .replaceAll(` (${MARKER})`, "")
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => (sentence.startsWith(MARKER) ? sentence.slice(MARKER.length) : sentence))
    .filter((sentence) => !sentence.includes(MARKER))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function Updated() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(
    i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage,
    {
      dateStyle: "long",
    },
  ).format(new Date(`${DOCS_UPDATED}T12:00:00Z`));
  return <p className="m-0 text-body-sm text-fg-muted">{t("site.lastUpdated", { date })}</p>;
}

/** A reading page: narrow column, sections with headings, one quiet document surface. */
function Document({ children }: { children: ReactNode }) {
  return (
    <Panel as="div" className="flex flex-col gap-8 rounded-lg p-6 sm:p-10">
      {children}
    </Panel>
  );
}

function DocSection({
  title,
  id,
  children,
}: {
  title: string;
  /** Anchor for the "On this page" list. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-2">
      <h2 className="m-0 text-h3">{title}</h2>
      <div className="max-w-[68ch] text-fg">{children}</div>
    </section>
  );
}

// ---- /about ----

const ABOUT = ["what", "problem", "how", "access", "privacy"] as const;

// ---- /how-it-works ----

const JOURNEY = ["search", "select", "join", "confirm", "arrive", "follow"] as const;

/**
 * How it works (public design brief 2026-11-04): read mode. The journey as a numbered
 * step-by-step list in one readable column (GOV.UK step-by-step), then what is good to know as a
 * plain list, then the one next step. No icon tiles, no cards per step.
 */
export function HowItWorksPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <PageContainer narrow className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.howItWorks") }]}
          title={t("site.how.title")}
          lead={t("site.how.lead")}
        />
        <div className="flex flex-col gap-12">
          <ol className="m-0 flex list-none flex-col p-0">
            {JOURNEY.map((key, index) => (
              <li key={key} className="relative flex gap-5 pb-8 last:pb-0">
                {/* the line that joins the steps, stopping at the last one */}
                {index < JOURNEY.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-10 bottom-0 left-[1.1875rem] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-fg/30 bg-surface font-heading font-bold text-fg tabular-nums"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1 pt-1.5">
                  <h2 className="m-0 text-h3">
                    <span className="sr-only">{t("site.home2.stepLabel", { n: index + 1 })}: </span>
                    {t(`site.how.steps.${key}.title`)}
                  </h2>
                  <p className="m-0 text-fg-secondary">{t(`site.how.steps.${key}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <section
            aria-labelledby="good"
            className="flex flex-col gap-3 border-t border-border pt-8"
          >
            <h2 id="good" className="m-0 text-h2">
              {t("site.how.goodTitle")}
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-fg">
              {(["noAccount", "walkIn", "reception", "noPhone"] as const).map((key) => (
                <li key={key}>{t(`site.how.good.${key}`)}</li>
              ))}
            </ul>
          </section>
          <Link
            to="/find-care"
            viewTransition
            className={buttonClassName({ size: "lg", pill: true, className: "self-start px-7" })}
          >
            {t("site.how.start")}
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /emergency ----

const SIGNS = [
  "chest",
  "breathing",
  "bleeding",
  "unconscious",
  "stroke",
  "pregnancy",
  "baby",
  "injury",
] as const;

/** The static referral list: shown when live hospitals fail to load or none are listed yet. */
function ReferralFallback({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      {failed && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-attention-bg/50 px-5 py-3 text-body-sm"
        >
          <span>{t("site.emergency.loadFailed", { number: EMERGENCY.number })}</span>
          <Button variant="ghost" pill onClick={onRetry}>
            {t("site.retry")}
          </Button>
        </div>
      )}
      <p className="m-0 px-5 pt-4 text-body-sm font-semibold text-fg-secondary">
        {t("site.emergency.referral")}
      </p>
      <ul className="m-0 list-none p-0">
        {REFERRAL_HOSPITALS.map((h) => (
          <li
            key={h.name}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 px-5 py-3.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 font-semibold text-fg">
              {h.name}
              <span className="block text-body-sm font-normal text-fg-secondary">{h.district}</span>
            </span>
            {h.phone && (
              <a
                href={`tel:${h.phone.replace(/\s/g, "")}`}
                className={buttonClassName({ variant: "secondary", pill: true })}
              >
                <Phone aria-hidden="true" className="size-4" />
                {h.phone}
              </a>
            )}
            <a
              href={mapSearchUrl(h.name)}
              target="_blank"
              rel="noreferrer"
              aria-label={`${t("site.facility.directions")}: ${h.name}`}
              className={buttonClassName({ variant: "secondary", pill: true })}
            >
              <NavigationArrow aria-hidden="true" className="size-4" />
              {t("site.facility.directions")}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Emergency (upgrade 11 §5; public design brief 2026-11-04): an urgent care card first (NHS
 * pattern: a red heading bar over the signs as a plain list and the call), then the nearest
 * places with directions. Facilities whose admin declares a 24-hour emergency department come
 * first; other hospitals follow, listed as hospitals only. Only the configured national number is
 * shown. Nothing on this page moves.
 */
export function EmergencyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { near, locating, locate } = useNearMe();
  const hospitals = useQuery({
    queryKey: ["discovery", "emergency-page", near],
    queryFn: () => api.booking.search({ near }),
    select: (page) => {
      const sorted = sortResults(
        page.results.filter((r) => r.emergency_department || isHospital(r.type)),
        near ? "nearest" : "name",
      );
      // a declared emergency department first; the order within each group is kept
      return [
        ...sorted.filter((r) => r.emergency_department),
        ...sorted.filter((r) => !r.emergency_department),
      ];
    },
  });
  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.emergencyShort") }]}
          title={t("site.emergency.title")}
          lead={t("site.emergency.lead")}
        />
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-8">
            {/* the urgent care card: what to look for, and the call */}
            <section
              aria-labelledby="signs"
              className="overflow-hidden rounded-lg border border-danger-solid bg-surface"
            >
              <h2
                id="signs"
                className="m-0 flex items-center gap-2 bg-danger-solid px-5 py-3.5 text-h3 text-on-danger-solid sm:px-6"
              >
                <Siren aria-hidden="true" weight="bold" className="size-5 shrink-0" />
                {t("site.emergency.signsTitle")}
              </h2>
              <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
                <ul className="m-0 grid list-disc gap-x-10 gap-y-2 pl-5 text-fg marker:text-danger sm:grid-cols-2">
                  {SIGNS.map((sign) => (
                    <li key={sign}>{t(`public.emergency.signs.${sign}`)}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5">
                  <a
                    href={`tel:${EMERGENCY.number}`}
                    className="inline-flex min-h-14 items-center gap-3 rounded-md bg-danger-solid px-6 font-heading text-[1.375rem] font-bold text-on-danger-solid no-underline transition-[filter] duration-150 hover:brightness-110"
                  >
                    <Phone aria-hidden="true" weight="fill" className="size-6" />
                    {t("site.emergency.callNow", { number: EMERGENCY.number })}
                  </a>
                  <span className="text-body-sm text-fg-secondary">
                    {t("site.emergency.callNote")}
                  </span>
                </div>
              </div>
            </section>

            <section aria-labelledby="hospitals" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 id="hospitals" className="m-0 text-h2">
                    {t("site.emergency.nearest")}
                  </h2>
                  <p className="m-0 text-body-sm text-fg-secondary">
                    {t("site.emergency.nearestNote")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  pill
                  onClick={locate}
                  loading={locating === "busy"}
                  iconStart={<Crosshair aria-hidden="true" className="size-4" />}
                >
                  {near ? t("home.nearYou") : t("site.emergency.nearMe")}
                </Button>
              </div>
              <Panel as="div" className="overflow-hidden rounded-lg">
                {hospitals.isPending ? (
                  <LoadingRows rows={3} />
                ) : hospitals.isError || !hospitals.data?.length ? (
                  <ReferralFallback
                    failed={hospitals.isError}
                    onRetry={() => void hospitals.refetch()}
                  />
                ) : (
                  <ul className="m-0 list-none p-0">
                    {hospitals.data.map((h) => (
                      <li
                        key={h.slug}
                        className="flex flex-col items-start gap-x-6 gap-y-3 border-b border-border px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:px-6"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Link
                            to={`/facilities/${h.slug}`}
                            viewTransition
                            className="font-semibold text-link no-underline hover:underline"
                          >
                            {h.name}
                          </Link>
                          <span className="text-body-sm text-fg-secondary">
                            {t(`booking.types.${h.type}`, { defaultValue: h.type })} · {h.district}
                            {h.distance_km !== null && (
                              <span className="font-semibold text-fg tabular-nums">
                                {" · "}
                                {t("booking.search.km", { km: h.distance_km })}
                              </span>
                            )}
                          </span>
                          {h.emergency_department && (
                            <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-danger">
                              <Siren aria-hidden="true" weight="bold" className="size-4" />
                              {t("site.emergency.department")}
                            </span>
                          )}
                        </div>
                        {h.lat !== null && h.lng !== null && (
                          <a
                            href={directionsUrl(h.lat, h.lng)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${t("site.facility.directions")}: ${h.name}`}
                            className={buttonClassName({ variant: "secondary", pill: true })}
                          >
                            <NavigationArrow aria-hidden="true" className="size-4" />
                            {t("site.facility.directions")}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>
          </div>

          <aside aria-labelledby="guidance" className="flex flex-col gap-3">
            <h2 id="guidance" className="m-0 text-h3">
              {t("site.emergency.guidanceTitle")}
            </h2>
            <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-fg marker:font-semibold">
              {[
                t("site.emergency.guidance.call", { number: EMERGENCY.number }),
                t("site.emergency.guidance.nearest"),
                t("site.emergency.guidance.bring"),
              ].map((line) => (
                <li key={line} className="pl-1">
                  {line}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /help ----

const HELP_CATEGORIES = [
  "finding",
  "queue",
  "booking",
  "arrival",
  "insurance",
  "accounts",
  "documents",
  "technical",
] as const;

/** Help centre (upgrade 11 §5): search, FAQ by category, published help articles, contact. */
export function HelpPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const [text, setText] = useState("");
  const words = text.trim().toLowerCase();
  const articles = useQuery({
    queryKey: ["discovery", "help-articles", words],
    queryFn: () => api.help.public.articles(words ? { q: words } : {}),
  });
  const groups = HELP_CATEGORIES.map((key) => ({
    key,
    title: t(`site.help.categories.${key}.title`),
    items: ([1, 2] as const)
      .map((n) => ({
        q: t(`site.help.categories.${key}.q${n}`),
        a: t(`site.help.categories.${key}.a${n}`),
      }))
      .filter((item) => !words || `${item.q} ${item.a}`.toLowerCase().includes(words)),
  })).filter((group) => group.items.length);

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("footer.help") }]}
          title={t("site.help.title")}
          lead={t("site.help.lead")}
        />
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
            <SearchBar
              id="help-search"
              label={t("site.help.search")}
              value={text}
              onChange={setText}
              placeholder={t("site.help.search")}
            />
            {groups.length > 1 && (
              <nav aria-label={t("site.services.jump")}>
                <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0">
                  {groups.map((group) => (
                    <li key={group.key}>
                      <a
                        href={`#help-${group.key}`}
                        className="inline-flex min-h-target items-center text-body-sm font-semibold text-link no-underline hover:underline"
                      >
                        {group.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          {groups.length === 0 ? (
            <Panel as="div">
              <EmptyState title={t("site.help.none")} />
            </Panel>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {groups.map((group) => (
                <Panel
                  key={group.key}
                  aria-labelledby={`help-${group.key}`}
                  className="scroll-mt-28 overflow-hidden"
                >
                  <h2
                    id={`help-${group.key}`}
                    className="m-0 border-b border-border/60 px-5 py-4 text-h3"
                  >
                    {group.title}
                  </h2>
                  {group.items.map((item) => (
                    <Faq key={item.q} question={item.q}>
                      {item.a}
                    </Faq>
                  ))}
                </Panel>
              ))}
            </div>
          )}
          {articles.isSuccess && articles.data.results.length > 0 && (
            <Panel aria-labelledby="articles" className="overflow-hidden">
              <h2 id="articles" className="m-0 border-b border-border/60 px-5 py-4 text-h3">
                {t("site.help.articles")}
              </h2>
              <ul className="m-0 list-none p-0">
                {articles.data.results.slice(0, 8).map((a) => (
                  <LinkRow
                    key={a.id}
                    to={`/support/articles/${a.slug}`}
                    title={pick(a.title_i18n, lang)}
                    detail={pick(a.summary_i18n, lang)}
                  />
                ))}
              </ul>
            </Panel>
          )}
          <section
            aria-labelledby="still"
            className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
          >
            <div>
              <h2 id="still" className="m-0 text-h2">
                {t("site.help.contactTitle")}
              </h2>
              <p className="m-0 mt-1 text-fg-secondary">{t("site.help.contactLead")}</p>
            </div>
            <Link to="/contact" viewTransition className={buttonClassName({ pill: true })}>
              <ChatCircleText aria-hidden="true" className="size-5" />
              {t("site.help.contactAction")}
            </Link>
          </section>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /about ----

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <PageContainer narrow className="pb-20">
        <PageHeader
          crumbs={[{ label: t("footer.about") }]}
          title={t("site.about.title")}
          lead={t("site.about.lead")}
        />
        {/* read mode: one column, the five themes as sections of one document */}
        <Document>
          {ABOUT.map((key) => (
            <section key={key} aria-labelledby={`about-${key}`} className="flex flex-col gap-2">
              <h2 id={`about-${key}`} className="m-0 text-h3">
                {t(`site.about.sections.${key}.title`)}
              </h2>
              <p className="m-0 max-w-[68ch] text-fg">{t(`site.about.sections.${key}.body`)}</p>
            </section>
          ))}
        </Document>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/for-facilities"
            viewTransition
            className={buttonClassName({ variant: "secondary", pill: true })}
          >
            {t("public.about.forFacilities")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link
            to="/privacy"
            viewTransition
            className={buttonClassName({ variant: "ghost", pill: true })}
          >
            {t("public.about.privacy")}
          </Link>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /contact ----

type ContactField = "name" | "reach" | "subject" | "message";
const CONTACT_FIELDS: ContactField[] = ["name", "reach", "subject", "message"];

/**
 * Contact (upgrade 11 §5): support information and a form with validation, sending, success and
 * error. Sends to the public contact endpoint (upgrade 11 §13): the message reaches the MediLink
 * team's inbox and the visitor gets a reference. Health details are refused, field by field.
 */
export function ContactPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [values, setValues] = useState<Record<ContactField, string>>({
    name: "",
    reach: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [reference, setReference] = useState("");

  const update = (field: ContactField) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<ContactField, string>> = {};
    if (!values.name.trim()) found.name = t("site.contact.errors.name");
    const reach = values.reach.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reach) && !/^\+?[\d\s]{9,15}$/.test(reach))
      found.reach = t("site.contact.errors.reach");
    if (!values.subject.trim()) found.subject = t("site.contact.errors.subject");
    if (values.message.trim().length < 10) found.message = t("site.contact.errors.message");
    setErrors(found);
    const first = (Object.keys(found) as ContactField[])[0];
    if (first) {
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    setState("sending");
    try {
      const receipt = await api.help.public.contact({
        name: values.name.trim(),
        reach: reach,
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      setReference(receipt.reference);
      setState("sent");
      setValues({ name: "", reach: "", subject: "", message: "" });
    } catch (error) {
      // the server's own words per field (e.g. "no health details here"), else the general error
      const server: Partial<Record<ContactField, string>> = {};
      if (error instanceof ApiError && error.status === 400) {
        for (const field of CONTACT_FIELDS) {
          const message = error.fields[field]?.[0];
          if (message) server[field] = message;
        }
      }
      const field = CONTACT_FIELDS.find((f) => server[f]);
      setErrors(server);
      setState(field ? "idle" : "failed");
      if (field) document.getElementById(`contact-${field}`)?.focus();
    }
  };

  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("footer.contact") }]}
          title={t("site.contact.title")}
          lead={t("site.contact.lead")}
        />
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Panel as="aside" className="flex flex-col gap-4 self-start p-6">
            <h2 className="m-0 text-h3">{t("site.contact.infoTitle")}</h2>
            <p className="m-0 text-fg-secondary">{t("site.contact.infoBody")}</p>
            <Link to="/help" viewTransition className="font-semibold">
              {t("footer.help")}
            </Link>
            <p className="m-0 flex items-start gap-2 rounded-2xl bg-danger-bg p-4 text-body-sm text-fg">
              <Siren
                aria-hidden="true"
                weight="bold"
                className="mt-0.5 size-4 shrink-0 text-danger"
              />
              {t("site.contact.emergency", { number: EMERGENCY.number })}
            </p>
          </Panel>
          <Panel as="div" className="p-6 sm:p-8">
            {state === "sent" ? (
              <Alert tone="success" role="status" title={t("site.contact.sent")}>
                {reference && t("site.contact.reference", { reference })}
              </Alert>
            ) : (
              <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
                {state === "failed" && (
                  <Alert tone="danger" role="alert" title={t("site.contact.failed")} />
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField
                    id="contact-name"
                    label={t("site.contact.name")}
                    autoComplete="name"
                    value={values.name}
                    onChange={(e) => update("name")(e.target.value)}
                    error={errors.name}
                  />
                  <TextField
                    id="contact-reach"
                    label={t("site.contact.reach")}
                    hint={t("site.contact.reachHint")}
                    autoComplete="email"
                    value={values.reach}
                    onChange={(e) => update("reach")(e.target.value)}
                    error={errors.reach}
                  />
                </div>
                <TextField
                  id="contact-subject"
                  label={t("site.contact.subject")}
                  value={values.subject}
                  onChange={(e) => update("subject")(e.target.value)}
                  error={errors.subject}
                />
                <TextareaField
                  id="contact-message"
                  label={t("site.contact.message")}
                  rows={6}
                  maxLength={2000}
                  value={values.message}
                  onChange={(e) => update("message")(e.target.value)}
                  error={errors.message}
                />
                <Button
                  type="submit"
                  size="lg"
                  pill
                  loading={state === "sending"}
                  className={cx("self-start px-7")}
                >
                  {state === "sending" ? t("site.contact.sending") : t("site.contact.send")}
                </Button>
              </form>
            )}
          </Panel>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /accessibility, /privacy, /terms ----

export function AccessibilityPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <PageContainer narrow className="pb-16">
        <PageHeader
          crumbs={[{ label: t("footer.accessibility") }]}
          title={t("site.accessibility.title")}
          lead={t("site.accessibility.lead")}
        />
        <Document>
          <Updated />
          {(["standard", "features", "offline", "limits", "feedback"] as const).map((key) => (
            <DocSection key={key} title={t(`site.accessibility.sections.${key}.title`)}>
              <p className="m-0">
                <Confirm>{t(`site.accessibility.sections.${key}.body`)}</Confirm>
              </p>
            </DocSection>
          ))}
        </Document>
      </PageContainer>
    </PublicLayout>
  );
}

const LEGAL_SECTIONS = {
  privacy: ["who", "what", "why", "where", "rights", "retention", "contact"],
  terms: ["account", "bookings", "emergencies", "guidance", "facilities", "fairUse", "law"],
} as const;

/** Privacy policy and terms: plain summary, then the sections; draft text is marked. */
function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <PageContainer className="pb-20">
        {/* the breadcrumb always matches the H1 */}
        <PageHeader
          crumbs={[{ label: t(`public.${doc}.title`) }]}
          title={t(`public.${doc}.title`)}
        />
        {/* the text beside a contents list that stays in view on wide screens */}
        <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label={t("site.onThisPage")} className="hidden lg:sticky lg:top-24 lg:block">
            <p className="m-0 mb-2 text-body-sm font-semibold text-fg">{t("site.onThisPage")}</p>
            <ol className="m-0 flex list-none flex-col border-l border-border p-0">
              {LEGAL_SECTIONS[doc].map((key) => (
                <li key={key}>
                  <a
                    href={`#${doc}-${key}`}
                    className="-ml-px block border-l border-transparent py-1.5 pl-4 text-body-sm text-link no-underline hover:border-fg-muted hover:underline"
                  >
                    {t(`public.${doc}.sections.${key}.title`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="mx-auto w-full max-w-[48rem]">
            <Document>
              <Updated />
              <DocSection title={t("public.legal.summaryTitle")}>
                <p className="m-0">
                  <Confirm>{t(`public.${doc}.summary`)}</Confirm>
                </p>
              </DocSection>
              {LEGAL_SECTIONS[doc].map((key) => (
                <DocSection
                  key={key}
                  id={`${doc}-${key}`}
                  title={t(`public.${doc}.sections.${key}.title`)}
                >
                  <p className="m-0">
                    <Confirm>{t(`public.${doc}.sections.${key}.body`)}</Confirm>
                  </p>
                </DocSection>
              ))}
            </Document>
          </div>
        </div>
      </PageContainer>
    </PublicLayout>
  );
}

export function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}

export function TermsPage() {
  return <LegalPage doc="terms" />;
}
