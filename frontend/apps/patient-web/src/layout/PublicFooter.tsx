import { ArrowUpRight, Phone, ShieldCheck, Siren } from "@phosphor-icons/react";
import { ImigongoPattern, LanguageSwitcher, Logo, ThemeSwitch } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const GROUPS = [
  {
    key: "explore",
    links: [
      { to: "/find-care", key: "nav.findCare" },
      { to: "/facilities", key: "nav.facilities" },
      { to: "/doctors", key: "nav.doctors" },
      { to: "/services", key: "nav.services" },
      { to: "/check-symptoms", key: "footer.checkSymptoms" },
    ],
  },
  {
    key: "information",
    links: [
      { to: "/how-it-works", key: "nav.howItWorks" },
      { to: "/about", key: "footer.about" },
      { to: "/for-facilities", key: "footer.forFacilities" },
      { to: "/verify", key: "footer.verify" },
      { to: "/help", key: "footer.help" },
      { to: "/contact", key: "footer.contact" },
    ],
  },
  {
    key: "legal",
    links: [
      { to: "/privacy", key: "footer.privacy" },
      { to: "/terms", key: "footer.terms" },
      { to: "/accessibility", key: "footer.accessibility" },
    ],
  },
] as const;

/**
 * Public footer (redesign "clinical calm"): light, with the one Imigongo band of the site along its
 * top edge at low opacity. The logo, one line and an emergency card; Explore, Information and Legal;
 * last, copyright, "Health data stored in Rwanda", the language and the theme.
 */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-border bg-surface text-fg print:hidden">
      {/* the site's single Imigongo signature: a thin band, low opacity */}
      <div aria-hidden="true" className="relative isolate h-3 overflow-hidden bg-brand-subtle">
        <ImigongoPattern opacity={0.18} className="-z-10 text-primary" />
      </div>
      <div className="mx-auto flex max-w-[75rem] flex-col gap-12 px-4 pt-12 pb-8 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex max-w-sm flex-col items-start gap-5">
            <Link
              to="/"
              viewTransition
              aria-label={t("nav.homeLabel")}
              className="inline-flex min-h-target items-center rounded-sm no-underline"
            >
              <Logo className="h-10" />
            </Link>
            <p className="m-0 text-body-sm leading-relaxed text-fg-secondary">
              {t("footer.tagline")}
            </p>
            <div className="flex w-full flex-col gap-2 rounded-2xl border border-danger/20 bg-danger-bg p-4">
              <p className="m-0 flex items-center gap-2 font-semibold text-danger">
                <Siren aria-hidden="true" weight="bold" className="size-5" />
                {t("nav.strip.long")}
              </p>
              <a
                href="tel:912"
                className="group inline-flex min-h-target items-center gap-2 self-start rounded-full bg-danger-solid px-4 font-semibold text-on-danger-solid no-underline transition-[filter] duration-150 hover:brightness-105"
              >
                <Phone aria-hidden="true" weight="fill" className="size-4" />
                {t("nav.strip.call")}
                <ArrowUpRight aria-hidden="true" weight="bold" className="size-4" />
              </a>
              <span className="text-caption text-fg-secondary">{t("footer.hotlineNote")}</span>
            </div>
          </div>
          <nav aria-label={t("footer.label")} className="grid gap-8 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <div key={group.key}>
                <h2
                  id={`footer-${group.key}`}
                  className="mt-0 mb-3 text-caption font-bold tracking-wider text-fg-secondary uppercase"
                >
                  {t(`footer.groups.${group.key}`)}
                </h2>
                <ul
                  aria-labelledby={`footer-${group.key}`}
                  className="m-0 flex list-none flex-col p-0"
                >
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        viewTransition
                        to={link.to}
                        className="inline-flex min-h-11 items-center text-body-sm text-fg no-underline transition-colors duration-150 ease-out-quint hover:text-primary hover:underline"
                      >
                        {t(link.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <p className="m-0 text-body-sm font-semibold">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border md:block" />
            <p className="m-0 inline-flex items-center gap-1.5 text-body-sm text-fg-secondary">
              <ShieldCheck aria-hidden="true" weight="bold" className="size-4 text-primary" />
              {t("footer.dataInRwanda")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}
