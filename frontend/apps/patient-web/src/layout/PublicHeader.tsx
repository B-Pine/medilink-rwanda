import { Phone } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router";

const NAV = [
  { to: "/", key: "nav.findCare" },
  { to: "/check-symptoms", key: "nav.checkSymptoms" },
  { to: "/for-facilities", key: "nav.forFacilities" },
] as const;

/**
 * Public header (upgrade 03 §1): logo, Find care, Check symptoms, For facilities, language and
 * Sign in, with "Emergency · 912" visible without scrolling on every page. On phones the three
 * links move to a second row that scrolls sideways.
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  return (
    <header className="border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
        <Link to="/" className="inline-flex min-h-target items-center rounded-sm no-underline">
          <Logo className="h-9" />
        </Link>
        <nav
          aria-label={t("nav.label")}
          className="order-last -mx-1 w-full overflow-x-auto md:order-none md:w-auto"
        >
          <ul className="m-0 flex list-none items-center gap-1 p-0">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className="inline-flex min-h-target items-center rounded-md px-3 font-semibold whitespace-nowrap text-fg-secondary no-underline hover:bg-subtle hover:text-fg aria-[current=page]:bg-subtle aria-[current=page]:text-fg"
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="tel:912"
            className="inline-flex min-h-target items-center gap-1.5 rounded-md px-2 font-semibold whitespace-nowrap text-danger no-underline hover:bg-danger-bg"
          >
            <Phone aria-hidden="true" weight="bold" className="size-4" />
            {t("nav.emergency")}
          </a>
          <LanguageSwitcher compact />
          {showLogin && (
            <Link to="/login" className={buttonClassName({ variant: "secondary" })}>
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
