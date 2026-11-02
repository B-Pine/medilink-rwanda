import {
  Buildings,
  FirstAid,
  LockKey,
  MapPin,
  Phone,
  SealCheck,
  Siren,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { cx, ImigongoPattern } from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";

const EMERGENCY_NUMBER = "912";

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

const SECTIONS = {
  privacy: ["who", "what", "why", "where", "rights", "retention", "contact"],
  terms: ["account", "bookings", "emergencies", "guidance", "facilities", "fairUse", "law"],
} as const;

/** Text marked "[To confirm]" in the copy is shown as a visible tag, never as a fact. */
function Confirm({ children }: { children: string }) {
  const { t } = useTranslation();
  const parts = children.split("[To confirm]");
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="mx-1 inline-flex rounded-full bg-attention-bg px-2 py-0.5 text-caption font-semibold text-attention">
              {t("public.toConfirm")}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

function Hero({
  eyebrow,
  title,
  lead,
  tone = "forest",
}: {
  eyebrow: string;
  title: string;
  lead: string;
  tone?: "forest" | "danger";
}) {
  return (
    <section
      className={cx(
        "relative isolate overflow-hidden",
        tone === "forest" ? "bg-forest text-on-forest" : "bg-danger-bg text-fg",
      )}
    >
      {tone === "forest" && (
        <ImigongoPattern opacity={0.06} className="-z-10 text-on-forest-accent" />
      )}
      <div className="mx-auto flex max-w-[56rem] flex-col gap-3 px-4 py-12 sm:px-6 sm:py-16">
        <p
          className={cx(
            "m-0 text-caption font-semibold tracking-wide uppercase",
            tone === "forest" ? "text-on-forest-muted" : "text-danger",
          )}
        >
          {eyebrow}
        </p>
        <PageHeading
          title={title}
          className={cx(
            "text-display font-extrabold tracking-tight",
            tone === "forest" ? "text-on-forest" : "text-fg",
          )}
        >
          {title}
        </PageHeading>
        <p
          className={cx(
            "m-0 max-w-[40rem] text-body",
            tone === "forest" ? "text-on-forest-muted" : "text-fg-secondary",
          )}
        >
          {lead}
        </p>
      </div>
    </section>
  );
}

function Point({
  icon: PointIcon,
  title,
  children,
}: {
  icon: Icon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-xl bg-surface p-5 shadow-card">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-subtle text-on-brand-subtle">
        <PointIcon aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 font-heading text-h3 font-bold">{title}</h2>
        <p className="m-0 text-fg-muted">{children}</p>
      </div>
    </div>
  );
}

/** /about (contract public-pages-and-triage §3): what MediLink is and who runs it. */
export function AboutPage() {
  const { t } = useTranslation();
  const points: { key: string; icon: Icon }[] = [
    { key: "patients", icon: UsersThree },
    { key: "facilities", icon: Buildings },
    { key: "verified", icon: SealCheck },
    { key: "rwanda", icon: LockKey },
  ];
  return (
    <PublicLayout>
      <Hero
        eyebrow={t("public.about.eyebrow")}
        title={t("public.about.title")}
        lead={t("public.about.lead")}
      />
      <div className="mx-auto flex max-w-[56rem] flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {points.map(({ key, icon }) => (
            <Point key={key} icon={icon} title={t(`public.about.points.${key}.title`)}>
              {t(`public.about.points.${key}.body`)}
            </Point>
          ))}
        </div>
        <section
          aria-labelledby="about-who"
          className="flex flex-col gap-3 rounded-xl bg-surface p-6 shadow-card"
        >
          <h2 id="about-who" className="m-0 font-heading text-h2 font-bold">
            {t("public.about.whoTitle")}
          </h2>
          <p className="m-0 text-fg-secondary">
            <Confirm>{t("public.about.whoBody")}</Confirm>
          </p>
          <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            {(["entity", "address", "email", "phone"] as const).map((field) => (
              <div key={field} className="contents">
                <dt className="font-semibold text-fg-muted">
                  {t(`public.about.contact.${field}`)}
                </dt>
                <dd className="m-0">
                  <Confirm>{t(`public.about.contactValue.${field}`)}</Confirm>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="m-0 flex flex-wrap gap-4">
          <Link to="/for-facilities" className="font-semibold">
            {t("public.about.forFacilities")}
          </Link>
          <Link to="/privacy" className="font-semibold">
            {t("public.about.privacy")}
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}

/** /emergency: what to do now. Always reachable from the footer and the symptom checker. */
export function EmergencyPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <Hero
        tone="danger"
        eyebrow={t("public.emergency.eyebrow")}
        title={t("public.emergency.title")}
        lead={t("public.emergency.lead", { number: EMERGENCY_NUMBER })}
      />
      <div className="mx-auto flex max-w-[56rem] flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-danger-solid p-6 text-on-danger-solid shadow-raised">
          <Phone aria-hidden="true" weight="fill" className="size-10" />
          <div className="flex flex-col">
            <span className="text-body-sm font-semibold opacity-90">
              {t("public.emergency.call")}
            </span>
            <span className="font-heading text-display leading-none font-extrabold tabular-nums">
              {EMERGENCY_NUMBER}
            </span>
          </div>
        </div>
        <section
          aria-labelledby="emergency-signs"
          className="flex flex-col gap-3 rounded-xl bg-surface p-6 shadow-card"
        >
          <h2
            id="emergency-signs"
            className="m-0 flex items-center gap-2 font-heading text-h2 font-bold"
          >
            <Siren aria-hidden="true" weight="fill" className="size-6 text-danger" />
            {t("public.emergency.signsTitle")}
          </h2>
          <ul className="m-0 grid gap-2 pl-5 sm:grid-cols-2">
            {SIGNS.map((sign) => (
              <li key={sign}>{t(`public.emergency.signs.${sign}`)}</li>
            ))}
          </ul>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Point icon={MapPin} title={t("public.emergency.goTitle")}>
            {t("public.emergency.goBody")}{" "}
            <Link to="/care" className="font-semibold">
              {t("public.emergency.findNearest")}
            </Link>
          </Point>
          <Point icon={FirstAid} title={t("public.emergency.notForTitle")}>
            {t("public.emergency.notForBody")}
          </Point>
        </div>
      </div>
    </PublicLayout>
  );
}

/** Privacy notice and terms (Law 058/2021, analysis 12 §8): a plain summary, then the sections. */
function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <p className="m-0 text-caption font-semibold tracking-wide text-fg-muted uppercase">
            {t("public.legal.eyebrow")}
          </p>
          <PageHeading
            title={t(`public.${doc}.title`)}
            className="text-h1 font-bold tracking-tight text-fg"
          >
            {t(`public.${doc}.title`)}
          </PageHeading>
        </div>
        <p className="m-0 rounded-xl bg-attention-bg p-4 text-body-sm text-fg">
          {t("public.legal.draft")}
        </p>
        <div className="rounded-xl bg-surface p-6 shadow-card">
          <h2 className="m-0 font-heading text-h3 font-bold">{t("public.legal.summaryTitle")}</h2>
          <p className="m-0 mt-2 text-fg-secondary">
            <Confirm>{t(`public.${doc}.summary`)}</Confirm>
          </p>
        </div>
        {SECTIONS[doc].map((key) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="m-0 font-heading text-h3 font-bold">
              {t(`public.${doc}.sections.${key}.title`)}
            </h2>
            <p className="m-0 text-fg-secondary">
              <Confirm>{t(`public.${doc}.sections.${key}.body`)}</Confirm>
            </p>
          </section>
        ))}
      </div>
    </PublicLayout>
  );
}

export function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}

export function TermsPage() {
  return <LegalPage doc="terms" />;
}
