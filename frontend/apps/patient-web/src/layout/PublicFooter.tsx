import { Phone } from "@phosphor-icons/react";
import { LanguageSwitcher, Logo } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const GROUPS = [
  {
    key: "care",
    links: [
      { to: "/care", key: "nav.findCare" },
      { to: "/check-symptoms", key: "footer.checkSymptoms" },
      { to: "/emergency", key: "footer.emergency" },
    ],
  },
  {
    key: "medilink",
    links: [
      { to: "/about", key: "footer.about" },
      { to: "/for-facilities", key: "footer.forFacilities" },
      { to: "/help", key: "footer.help" },
    ],
  },
  {
    key: "trust",
    links: [
      { to: "/verify", key: "footer.verify" },
      { to: "/privacy", key: "footer.privacy" },
      { to: "/terms", key: "footer.terms" },
    ],
  },
] as const;

/**
 * Footer (upgrade 03 §1): the logo, three short link groups, languages and copyright, with one
 * line for emergencies. Calm and flat: hairline on top, no boxes.
 */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-border bg-surface print:hidden">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-10 px-4 pt-10 pb-8 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col items-start gap-4">
            <Logo className="h-9" />
            <a
              href="tel:912"
              className="inline-flex min-h-target items-center gap-2 rounded-md text-body-sm font-semibold text-danger no-underline hover:underline"
            >
              <Phone aria-hidden="true" weight="bold" className="size-4" />
              {t("footer.emergencyLine")}
            </a>
          </div>
          {GROUPS.map((group) => (
            <nav key={group.key} aria-labelledby={`footer-${group.key}`}>
              <h2
                id={`footer-${group.key}`}
                className="mt-0 mb-2 text-caption font-semibold tracking-wide text-fg-muted uppercase"
              >
                {t(`footer.groups.${group.key}`)}
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="inline-flex min-h-target items-center text-body-sm text-fg-secondary no-underline transition-colors duration-150 ease-out-quint hover:text-fg hover:underline"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <p className="m-0 text-body-sm text-fg-muted">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <LanguageSwitcher compact />
        </div>
      </div>
    </footer>
  );
}
