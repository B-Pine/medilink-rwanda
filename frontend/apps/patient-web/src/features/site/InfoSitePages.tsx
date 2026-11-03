import {
  ArrowRight,
  BellRinging,
  Buildings,
  ChatCircleText,
  CheckCircle,
  Crosshair,
  MagnifyingGlass,
  NavigationArrow,
  Phone,
  Siren,
  Ticket,
  UserCheck,
  type Icon,
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
import { EMERGENCY, isHospital } from "./data";
import { EmergencyIllustration } from "./illustrations";
import {
  EmptyState,
  ErrorState,
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

/** "[To confirm]" in a text becomes a visible tag, never a fact (analysis 12 §8). */
function Confirm({ children }: { children: string }) {
  const { t } = useTranslation();
  const parts = children.split("[To confirm]");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="mx-1 inline-flex rounded-full bg-attention-bg px-2 py-0.5 text-caption font-semibold text-attention">
              {t("site.toConfirm")}
            </span>
          )}
        </span>
      ))}
    </>
  );
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
    <Panel as="div" className="flex flex-col gap-8 p-6 sm:p-10">
      {children}
    </Panel>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-h3">{title}</h2>
      <div className="text-fg-secondary">{children}</div>
    </section>
  );
}

// ---- /how-it-works ----

const JOURNEY: { key: string; icon: Icon }[] = [
  { key: "search", icon: MagnifyingGlass },
  { key: "select", icon: Buildings },
  { key: "join", icon: Ticket },
  { key: "confirm", icon: CheckCircle },
  { key: "arrive", icon: UserCheck },
  { key: "follow", icon: BellRinging },
];

export function HowItWorksPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.howItWorks") }]}
          title={t("site.how.title")}
          lead={t("site.how.lead")}
        />
        <div className="ml-stagger flex flex-col gap-10">
          <ol className="relative m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {JOURNEY.map(({ key, icon: StepIcon }, index) => (
              <li key={key}>
                <Panel as="div" className="flex h-full gap-4 p-5">
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-subtle text-on-brand-subtle">
                    <StepIcon aria-hidden="true" className="size-6" />
                    <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-forest text-caption font-bold text-on-forest">
                      {index + 1}
                    </span>
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-h3">{t(`site.how.steps.${key}.title`)}</h2>
                    <p className="m-0 text-body-sm text-fg-secondary">
                      {t(`site.how.steps.${key}.body`)}
                    </p>
                  </div>
                </Panel>
              </li>
            ))}
          </ol>
          <section
            aria-labelledby="good"
            className="grid gap-6 rounded-3xl bg-brand-subtle/70 p-6 sm:p-8 lg:grid-cols-[16rem_minmax(0,1fr)]"
          >
            <h2 id="good" className="m-0 text-h2 tracking-tight">
              {t("site.how.goodTitle")}
            </h2>
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
              {(["noAccount", "walkIn", "reception", "noPhone"] as const).map((key) => (
                <li key={key} className="flex gap-3">
                  <CheckCircle
                    aria-hidden="true"
                    weight="fill"
                    className="mt-0.5 size-5 shrink-0 text-primary"
                  />
                  <span className="text-fg">{t(`site.how.good.${key}`)}</span>
                </li>
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

/**
 * Emergency (upgrade 11 §5): call first, then the nearest hospitals with directions. Only the
 * configured national number is shown; hospitals are listed as hospitals, without claims about an
 * emergency department until listings carry that flag (upgrade 11 §13).
 */
export function EmergencyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { near, locating, locate } = useNearMe();
  const hospitals = useQuery({
    queryKey: ["discovery", "emergency-page", near],
    queryFn: () => api.booking.search({ near }),
    select: (page) =>
      sortResults(
        page.results.filter((r) => isHospital(r.type)),
        near ? "nearest" : "name",
      ),
  });
  return (
    <PublicLayout>
      <PageContainer className="pb-16">
        <PageHeader
          crumbs={[{ label: t("nav.emergencyShort") }]}
          title={t("site.emergency.title")}
          lead={t("site.emergency.lead")}
        />
        <div className="ml-stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-6">
            <a
              href={`tel:${EMERGENCY.number}`}
              className="group flex items-center gap-5 rounded-3xl bg-danger-solid p-6 text-on-danger-solid no-underline shadow-raised transition-transform duration-150 ease-out-quint active:scale-[0.99] sm:p-8"
            >
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-on-danger-solid/15">
                <Phone aria-hidden="true" weight="fill" className="size-8" />
              </span>
              <span className="flex flex-col">
                <span className="font-heading text-[2rem] leading-tight font-bold">
                  {t("site.emergency.callNow", { number: EMERGENCY.number })}
                </span>
                <span className="text-body-sm opacity-90">{t("site.emergency.callNote")}</span>
              </span>
            </a>

            <Panel aria-labelledby="hospitals" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                <div>
                  <h2 id="hospitals" className="m-0 text-h3">
                    {t("site.emergency.nearest")}
                  </h2>
                  <p className="m-0 text-body-sm text-fg-muted">
                    {t("site.emergency.nearestNote")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  pill
                  onClick={locate}
                  loading={locating === "busy"}
                  iconStart={<Crosshair aria-hidden="true" className="size-4" />}
                >
                  {near ? t("home.nearYou") : t("site.emergency.nearMe")}
                </Button>
              </div>
              {hospitals.isPending ? (
                <LoadingRows rows={3} />
              ) : hospitals.isError ? (
                <ErrorState onRetry={() => void hospitals.refetch()} />
              ) : !hospitals.data?.length ? (
                <EmptyState title={t("site.emergency.none")} />
              ) : (
                <ul className="m-0 list-none p-0">
                  {hospitals.data.map((h) => (
                    <li
                      key={h.slug}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 px-5 py-4 last:border-b-0"
                    >
                      <Link
                        to={`/facilities/${h.slug}`}
                        viewTransition
                        className="min-w-0 flex-1 font-semibold text-fg"
                      >
                        {h.name}
                        <span className="block text-body-sm font-normal text-fg-secondary">
                          {t(`booking.types.${h.type}`, { defaultValue: h.type })} · {h.district}
                        </span>
                      </Link>
                      {h.distance_km !== null && (
                        <span className="text-body-sm font-semibold tabular-nums">
                          {t("booking.search.km", { km: h.distance_km })}
                        </span>
                      )}
                      {h.lat !== null && h.lng !== null && (
                        <a
                          href={directionsUrl(h.lat, h.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClassName({
                            variant: "secondary",
                            size: "sm",
                            pill: true,
                          })}
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
          </div>

          <div className="flex flex-col gap-6">
            <Panel aria-labelledby="signs" className="p-6">
              <EmergencyIllustration className="mb-4 h-24 w-auto" />
              <h2 id="signs" className="m-0 flex items-center gap-2 text-h3">
                <Siren aria-hidden="true" weight="bold" className="size-5 text-danger" />
                {t("site.emergency.signsTitle")}
              </h2>
              <ul className="m-0 mt-3 flex flex-col gap-1.5 pl-5 text-fg-secondary">
                {SIGNS.map((sign) => (
                  <li key={sign}>{t(`public.emergency.signs.${sign}`)}</li>
                ))}
              </ul>
            </Panel>
            <Panel aria-labelledby="guidance" className="p-6">
              <h2 id="guidance" className="m-0 text-h3">
                {t("site.emergency.guidanceTitle")}
              </h2>
              <ol className="m-0 mt-3 flex flex-col gap-2 pl-5 text-fg-secondary">
                <li>{t("site.emergency.guidance.call", { number: EMERGENCY.number })}</li>
                <li>{t("site.emergency.guidance.nearest")}</li>
                <li>{t("site.emergency.guidance.bring")}</li>
              </ol>
            </Panel>
          </div>
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
        <div className="ml-stagger flex flex-col gap-8">
          <SearchBar
            id="help-search"
            label={t("site.help.search")}
            value={text}
            onChange={setText}
            placeholder={t("site.help.search")}
            className="max-w-2xl"
          />
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
                  className="overflow-hidden"
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
            className="flex flex-col items-start gap-4 rounded-3xl bg-brand-subtle/70 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
          >
            <div>
              <h2 id="still" className="m-0 text-h2 tracking-tight">
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
      <PageContainer narrow className="pb-16">
        <PageHeader
          crumbs={[{ label: t("footer.about") }]}
          title={t("site.about.title")}
          lead={t("site.about.lead")}
        />
        <Document>
          {(["what", "problem", "how", "access", "privacy"] as const).map((key) => (
            <DocSection key={key} title={t(`site.about.sections.${key}.title`)}>
              <p className="m-0">{t(`site.about.sections.${key}.body`)}</p>
            </DocSection>
          ))}
          <p className="m-0 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-6">
            <Link to="/for-facilities" viewTransition className="font-semibold">
              {t("public.about.forFacilities")}
            </Link>
            <Link to="/privacy" viewTransition className="font-semibold">
              {t("public.about.privacy")}
            </Link>
          </p>
        </Document>
      </PageContainer>
    </PublicLayout>
  );
}

// ---- /contact ----

type ContactField = "name" | "reach" | "subject" | "message";

/**
 * Contact (upgrade 11 §5): support information and a form with validation, sending, success and
 * error. Sends to the public contact endpoint (upgrade 11 §13); until it exists the error state
 * tells the person plainly.
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
    if (!values.message.trim()) found.message = t("site.contact.errors.message");
    setErrors(found);
    const first = (Object.keys(found) as ContactField[])[0];
    if (first) {
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    setState("sending");
    try {
      await api.help.public.contact({
        name: values.name.trim(),
        reach: reach,
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      setState("sent");
      setValues({ name: "", reach: "", subject: "", message: "" });
    } catch {
      setState("failed");
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
        <div className="ml-stagger grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
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
              <Alert tone="success" role="status" title={t("site.contact.sent")} />
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
      <PageContainer narrow className="pb-16">
        <PageHeader crumbs={[{ label: t(`footer.${doc}`) }]} title={t(`public.${doc}.title`)} />
        <Document>
          <Updated />
          <p className="m-0 rounded-2xl bg-attention-bg p-4 text-body-sm text-fg">
            {t("site.draft")}
          </p>
          <DocSection title={t("public.legal.summaryTitle")}>
            <p className="m-0">
              <Confirm>{t(`public.${doc}.summary`)}</Confirm>
            </p>
          </DocSection>
          {LEGAL_SECTIONS[doc].map((key) => (
            <DocSection key={key} title={t(`public.${doc}.sections.${key}.title`)}>
              <p className="m-0">
                <Confirm>{t(`public.${doc}.sections.${key}.body`)}</Confirm>
              </p>
            </DocSection>
          ))}
        </Document>
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
