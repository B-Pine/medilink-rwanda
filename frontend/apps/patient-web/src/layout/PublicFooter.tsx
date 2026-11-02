import { LanguageSwitcher, Logo } from "@medilink/ui";
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
    ],
  },
  {
    key: "information",
    links: [
      { to: "/how-it-works", key: "nav.howItWorks" },
      { to: "/about", key: "footer.about" },
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
 * Public footer (upgrade 11 §6): deep forest, the light logo and one line about MediLink, three
 * compact link columns (Explore, Information, Legal), then copyright, language and a short trust
 * line. Social links appear only once official accounts are configured (none yet).
 */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="relative isolate mt-auto bg-forest text-on-forest print:hidden">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-12 px-4 pt-14 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex max-w-xs flex-col items-start gap-4">
            <Link to="/" viewTransition className="inline-flex rounded-sm no-underline">
              <Logo tone="onDark" className="h-10" />
            </Link>
            <p className="m-0 text-body-sm text-on-forest-muted">{t("footer.tagline")}</p>
          </div>
          {GROUPS.map((group) => (
            <nav key={group.key} aria-labelledby={`footer-${group.key}`}>
              <h2
                id={`footer-${group.key}`}
                className="mt-0 mb-3 text-caption font-semibold tracking-wider text-on-forest uppercase"
              >
                {t(`footer.groups.${group.key}`)}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      viewTransition
                      to={link.to}
                      className="inline-flex min-h-10 items-center text-body-sm text-on-forest-muted no-underline transition-colors duration-150 ease-out-quint hover:text-on-forest"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-col gap-4 border-t border-on-forest/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-body-sm text-on-forest">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <p className="m-0 text-caption text-on-forest-muted">{t("footer.trust")}</p>
          </div>
          <LanguageSwitcher compact onDark />
        </div>
      </div>
    </footer>
  );
}
