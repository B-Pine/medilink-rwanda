import {
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  Phone,
  Stethoscope,
} from "@phosphor-icons/react";
import { ImigongoPattern, LanguageSwitcher, Logo } from "@medilink/ui";
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
      { to: "/emergency", key: "footer.emergency" },
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
 * Public footer (upgrade 11 §6): deep forest with a faint Imigongo pattern. A call-to-action card
 * (Find care, Check symptoms) sits on top; below it the light logo, one line about MediLink and a
 * tap-to-call 912 card, then three link columns (Explore, Information, Legal) in one "Site links"
 * navigation; last, copyright, the trust line and the language. Social links appear only once
 * official accounts are configured (none yet).
 */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="relative isolate mt-auto overflow-hidden border-t border-on-forest/10 bg-forest text-on-forest print:hidden">
      <ImigongoPattern opacity={0.05} className="-z-10 text-on-forest-accent" />
      <div className="mx-auto flex max-w-[84rem] flex-col gap-14 px-4 pt-12 pb-8 sm:px-6 lg:px-8 lg:pt-16">
        <section
          aria-labelledby="footer-cta"
          className="flex flex-col gap-6 rounded-[1.75rem] border border-on-forest/10 bg-forest-raised p-6 sm:p-8 md:flex-row md:items-center md:justify-between lg:p-10"
        >
          <div className="flex max-w-xl flex-col gap-2">
            <h2
              id="footer-cta"
              className="m-0 font-heading text-h2 tracking-tight text-balance text-on-forest"
            >
              {t("footer.cta.title")}
            </h2>
            <p className="m-0 text-on-forest-muted">{t("footer.cta.body")}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link
              to="/find-care"
              viewTransition
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-on-forest px-6 font-semibold whitespace-nowrap text-forest no-underline transition-[filter,transform] duration-150 ease-out-quint hover:brightness-95 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <MagnifyingGlass aria-hidden="true" weight="bold" className="size-4" />
              {t("nav.findCare")}
              <ArrowRight
                aria-hidden="true"
                weight="bold"
                className="size-4 transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
            <Link
              to="/check-symptoms"
              viewTransition
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-on-forest/25 px-6 font-semibold whitespace-nowrap text-on-forest no-underline transition-colors duration-150 ease-out-quint hover:border-on-forest/50 hover:bg-on-forest/10"
            >
              <Stethoscope aria-hidden="true" weight="bold" className="size-4" />
              {t("footer.cta.symptoms")}
            </Link>
          </div>
        </section>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex max-w-sm flex-col items-start gap-5">
            <Link
              to="/"
              viewTransition
              aria-label={t("nav.homeLabel")}
              className="inline-flex min-h-target items-center rounded-sm no-underline"
            >
              <Logo tone="onDark" className="h-10" />
            </Link>
            <p className="m-0 text-body-sm leading-relaxed text-on-forest-muted">
              {t("footer.tagline")}
            </p>
            <a
              href="tel:912"
              className="group flex items-center gap-3 rounded-2xl border border-on-forest/10 bg-on-forest/5 py-3 pr-4 pl-3 text-on-forest no-underline transition-colors duration-150 ease-out-quint hover:border-on-forest/25 hover:bg-on-forest/10"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-solid text-on-danger-solid">
                <Phone aria-hidden="true" weight="fill" className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-body-sm font-semibold">{t("footer.cta.call")}</span>
                <span className="text-caption text-on-forest-muted">{t("footer.hotlineNote")}</span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                weight="bold"
                className="ml-2 size-4 text-on-forest-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
              />
            </a>
          </div>
          <nav aria-label={t("footer.label")} className="grid gap-10 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <div key={group.key}>
                <h2
                  id={`footer-${group.key}`}
                  className="mt-0 mb-4 text-caption font-semibold tracking-wider text-on-forest-accent uppercase"
                >
                  {t(`footer.groups.${group.key}`)}
                </h2>
                <ul
                  aria-labelledby={`footer-${group.key}`}
                  className="m-0 flex list-none flex-col gap-1 p-0"
                >
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        viewTransition
                        to={link.to}
                        className="group inline-flex min-h-9 items-center gap-1.5 text-body-sm text-on-forest-muted no-underline transition-colors duration-150 ease-out-quint hover:text-on-forest"
                      >
                        <span className="h-px w-0 bg-on-forest-accent transition-[width] duration-200 ease-out-quint group-hover:w-3 motion-reduce:transition-none" />
                        {t(link.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-on-forest/15 pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <p className="m-0 text-body-sm font-semibold text-on-forest">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <span aria-hidden="true" className="hidden h-4 w-px bg-on-forest/20 md:block" />
            <p className="m-0 max-w-xl text-caption text-on-forest-muted">{t("footer.trust")}</p>
          </div>
          <LanguageSwitcher compact onDark />
        </div>
      </div>
    </footer>
  );
}
