import {
  CaretRight,
  ChatCircleText,
  Gear,
  IdentificationCard,
  MagnifyingGlass,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import { Alert, cx, ImigongoPattern } from "@medilink/ui";
import { dateFormat, kigaliHour } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { FEATURE_HOME_CARDS, FEATURE_HOME_MAIN, FEATURE_HOME_TOP } from "../app/features";
import { usePatientMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";

/** Morning before 12:00, afternoon before 18:00, evening after, in Kigali time. */
function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hour = kigaliHour(now);
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

const SHORTCUTS: { to: string; key: string; icon: Icon }[] = [
  { to: "/profile", key: "profile", icon: IdentificationCard },
  { to: "/privacy/settings", key: "privacy", icon: ShieldCheck },
  { to: "/settings", key: "settings", icon: Gear },
];

/**
 * Patient home (design 07 §3.1): a live ticket fills the top when there is one; otherwise finding
 * care leads, with "not sure where to go?" right beside it. Then the next visit, family and a
 * short list of account shortcuts. The emergency notice is always on the page.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: me } = usePatientMe();
  if (!me) return null;
  const now = new Date();
  const today = dateFormat(i18n.resolvedLanguage ?? "rw", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Kigali",
  }).format(now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {today}
        </p>
        <PageHeading title={t("home.title")} className="text-h1 font-bold tracking-tight text-fg">
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
        <div className="flex flex-col gap-4">
          <section
            aria-labelledby="find-care"
            className="relative isolate flex flex-col gap-4 overflow-hidden rounded-xl bg-forest p-5 text-on-forest shadow-raised sm:p-7"
          >
            <ImigongoPattern opacity={0.07} className="-z-10 text-on-forest-accent" />
            <div className="flex flex-col gap-1.5">
              <h2 id="find-care" className="m-0 font-heading text-h2 font-bold text-on-forest">
                {t("home.findCareTitle")}
              </h2>
              <p className="m-0 max-w-[30rem] text-on-forest-muted">{t("home.findCareBody")}</p>
            </div>
            <Link
              to="/care"
              className={cx(
                "flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 text-fg-muted no-underline shadow-raised",
                "transition-transform duration-150 active:scale-[0.99]",
              )}
            >
              <MagnifyingGlass aria-hidden="true" weight="bold" className="size-6 text-brand" />
              <span className="flex-1">{t("home.findCare")}</span>
              <CaretRight aria-hidden="true" weight="bold" className="size-5" />
            </Link>
          </section>

          <Link
            to="/check-symptoms"
            aria-label={t("home.notSure")}
            aria-describedby="home-not-sure"
            className={cx(
              "group flex items-center gap-4 rounded-xl bg-surface p-4 no-underline shadow-card sm:p-5",
              "transition-[transform,background-color] duration-150 hover:bg-raised active:scale-[0.99]",
            )}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-subtle text-on-brand-subtle">
              <ChatCircleText aria-hidden="true" weight="duotone" className="size-7" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-heading text-h3 font-bold text-fg">{t("home.notSure")}</span>
              <span id="home-not-sure" className="text-body-sm text-fg-muted">
                {t("home.notSureBody")}
              </span>
            </span>
            <CaretRight
              aria-hidden="true"
              weight="bold"
              className="size-5 text-fg-muted transition-transform group-hover:translate-x-0.5"
            />
          </Link>

          {FEATURE_HOME_MAIN().map((Main, index) => (
            <Main key={index} />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {FEATURE_HOME_CARDS().map((HomeCard, index) => (
            <HomeCard key={index} />
          ))}
          <nav aria-label={t("home.shortcuts")}>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-card">
              {SHORTCUTS.map(({ to, key, icon: LinkIcon }) => (
                <li key={to} className="border-t border-border first:border-t-0">
                  <Link
                    to={to}
                    className="group flex min-h-target items-center gap-3 px-4 py-3.5 font-semibold text-fg no-underline transition-colors hover:bg-raised"
                  >
                    <LinkIcon aria-hidden="true" weight="duotone" className="size-6 text-brand" />
                    <span className="flex-1">{t(`home.links.${key}`)}</span>
                    <CaretRight aria-hidden="true" className="size-5 text-fg-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <EmergencyNotice />
    </div>
  );
}
