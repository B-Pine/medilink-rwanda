import { ArrowUpRight, Phone, ShieldCheck } from "@phosphor-icons/react";
import { LanguageSwitcher, Logo, ThemeSwitch } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** The brand wordmark: decorative, hidden from assistive tech, the same in every language. */
const WORDMARK = "MediLink";

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
 * Public footer (second pass, 2026-11-04): a hairline top, the brand column (logo, one line, the
 * 912 line) beside three quiet link columns, a slim bottom bar (copyright, data in Rwanda,
 * language, theme), and the MediLink wordmark set very large and faint as the signature.
 */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="relative isolate mt-auto overflow-hidden border-t border-hairline bg-surface text-fg print:hidden">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-12 px-4 pt-16 pb-8 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20">
          <div className="flex max-w-sm flex-col items-start gap-5">
            <Link
              to="/"
              viewTransition
              aria-label={t("nav.homeLabel")}
              className="inline-flex min-h-target items-center rounded-sm no-underline"
            >
              <Logo className="h-9" />
            </Link>
            <p className="m-0 text-body leading-relaxed text-fg-secondary">{t("footer.tagline")}</p>
            <a
              href="tel:912"
              className="group inline-flex min-h-11 items-center gap-3 rounded-2xl bg-surface py-2 pr-4 pl-2 no-underline shadow-e1 transition-shadow duration-200 hover:shadow-e2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-danger-solid text-on-danger-solid">
                <Phone aria-hidden="true" weight="fill" className="size-3.5" />
              </span>
              <span className="flex flex-col">
                <span className="text-body-sm font-bold text-danger">{t("nav.strip.call")}</span>
                <span className="text-caption text-fg-secondary">{t("footer.hotlineNote")}</span>
              </span>
            </a>
          </div>
          <nav aria-label={t("footer.label")} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <div key={group.key} className="flex flex-col gap-3">
                <h2
                  id={`footer-${group.key}`}
                  className="m-0 text-caption font-semibold tracking-wide text-fg-muted"
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
                        className="group inline-flex min-h-10 items-center gap-1 text-body-sm text-fg-secondary no-underline transition-colors duration-150 ease-out-quint hover:text-fg"
                      >
                        {t(link.key)}
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 ease-out-quint group-hover:translate-x-0 group-hover:opacity-100"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-hairline pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 text-body-sm text-fg-secondary md:flex-row md:items-center md:gap-4">
            <p className="m-0">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
            <p className="m-0 inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" weight="duotone" className="size-4 text-primary" />
              {t("footer.dataInRwanda")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher pill />
            <ThemeSwitch />
          </div>
        </div>
      </div>
      {/* the signature: the wordmark, very large and faint, cut by the page edge */}
      <p
        aria-hidden="true"
        className="pointer-events-none -mt-6 mb-[-2.5vw] text-center font-heading text-[clamp(5rem,17vw,16rem)] leading-[0.8] font-bold tracking-[-0.06em] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_22%,transparent)_10%,transparent_90%)] bg-clip-text text-transparent select-none"
      >
        {WORDMARK}
      </p>
    </footer>
  );
}
