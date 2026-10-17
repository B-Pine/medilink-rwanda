import { SignIn } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * Public header (design 06 §3): logo, main links, language switch at the top, Log in.
 * Section links collapse on small screens (they are also in the footer).
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  return (
    <header className="border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex max-w-[70rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <Link to="/" className="inline-flex min-h-target items-center rounded-sm no-underline">
          <Logo className="h-10" />
        </Link>
        <nav aria-label={t("nav.label")} className="hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-1 p-0">
            <li>
              <a
                href="/#find-care"
                className="inline-flex min-h-target items-center rounded-sm px-3 font-semibold text-fg no-underline hover:bg-subtle"
              >
                {t("nav.findCare")}
              </a>
            </li>
            <li>
              <a
                href="/#how-it-works"
                className="inline-flex min-h-target items-center rounded-sm px-3 font-semibold text-fg no-underline hover:bg-subtle"
              >
                {t("nav.howItWorks")}
              </a>
            </li>
            <li>
              <Link
                to="/for-facilities"
                className="inline-flex min-h-target items-center rounded-sm px-3 font-semibold text-fg no-underline hover:bg-subtle"
              >
                {t("nav.forFacilities")}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LanguageSwitcher compact />
          {showLogin && (
            <Link to="/login" className={buttonClassName({ variant: "secondary" })}>
              <SignIn aria-hidden="true" className="size-icon" />
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
