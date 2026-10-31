import {
  CaretRight,
  ChatCircleText,
  Gear,
  IdentificationCard,
  MagnifyingGlass,
  ShieldCheck,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { Alert, buttonClassName, ImigongoPattern } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { FEATURE_HOME_CARDS, FEATURE_HOME_MAIN, FEATURE_HOME_TOP } from "../app/features";
import { usePatientMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";

/** Morning before 12:00, afternoon before 18:00, evening after, in Kigali time. */
function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", timeZone: "Africa/Kigali" }).format(now),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

function QuickLink({ to, label, icon: LinkIcon }: { to: string; label: string; icon: Icon }) {
  return (
    <Link
      to={to}
      className="group flex min-h-target items-center gap-3 rounded-lg border border-border bg-surface p-4 font-semibold text-fg no-underline hover:border-brand hover:bg-brand-subtle"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-on-brand-subtle group-hover:bg-surface">
        <LinkIcon aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <span className="flex-1">{label}</span>
      <CaretRight aria-hidden="true" className="size-5 text-fg-muted" />
    </Link>
  );
}

/**
 * Patient home (design 07 §3.1): an active visit's tracker fills the top; otherwise Find care
 * leads, then the next visit, family and shortcuts. The emergency notice is always on the page.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: me } = usePatientMe();
  if (!me) return null;
  const now = new Date();
  const today = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "rw", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Kigali",
  }).format(now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-body-sm font-semibold text-fg-muted first-letter:uppercase">
          {today}
        </p>
        <PageHeading title={t("home.title")}>
          {t(`home.greeting_${partOfDay(now)}`, { name: me.full_name })}
        </PageHeading>
      </div>

      {!me.email_verified && (
        <Alert tone="info" title={t("home.verifyEmailTitle")}>
          {t("home.verifyEmailBody", { email: me.email })}
        </Alert>
      )}

      {FEATURE_HOME_TOP().map((Top, index) => (
        <Top key={index} />
      ))}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="find-care"
            className="relative isolate overflow-hidden rounded-lg bg-forest p-6 text-on-forest shadow-raised sm:p-8"
          >
            <ImigongoPattern opacity={0.08} className="-z-10 text-on-forest" />
            <h2 id="find-care" className="m-0 font-heading text-h2 text-on-forest">
              {t("home.findCareTitle")}
            </h2>
            <p className="m-0 mt-2 max-w-[28rem] text-on-forest-muted">{t("home.findCareBody")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link to="/find-care" className={buttonClassName({ size: "lg" })}>
                <MagnifyingGlass aria-hidden="true" className="size-icon" />
                {t("home.findCare")}
              </Link>
              <Link
                to="/find-care#symptoms"
                className="inline-flex min-h-target items-center gap-2 rounded-sm font-semibold text-on-forest-accent underline-offset-4 hover:underline"
              >
                <ChatCircleText aria-hidden="true" className="size-icon" />
                {t("home.notSure")}
              </Link>
            </div>
          </section>

          {FEATURE_HOME_MAIN().map((Main, index) => (
            <Main key={index} />
          ))}
        </div>

        <div className="flex flex-col gap-6">
          {FEATURE_HOME_CARDS().map((HomeCard, index) => (
            <HomeCard key={index} />
          ))}
          <nav aria-label={t("home.shortcuts")} className="flex flex-col gap-2">
            <QuickLink to="/profile" label={t("home.links.profile")} icon={IdentificationCard} />
            <QuickLink to="/family" label={t("home.links.family")} icon={UsersThree} />
            <QuickLink to="/privacy/settings" label={t("home.links.privacy")} icon={ShieldCheck} />
            <QuickLink to="/settings" label={t("home.links.settings")} icon={Gear} />
          </nav>
        </div>
      </div>

      <EmergencyNotice />
    </div>
  );
}
