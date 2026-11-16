import { Globe, List, Phone, Siren, SignIn } from "@phosphor-icons/react";
import { buttonClassName, cx, Logo, Sheet, ThemeSwitch } from "@medilink/ui";
import { SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigation } from "react-router";

export const PUBLIC_NAV = [
  // `end`: Home is current on "/" only, not on every page under it
  { to: "/", key: "nav.home", end: true },
  { to: "/find-care", key: "nav.findCare", end: false },
  { to: "/facilities", key: "nav.facilities", end: false },
  { to: "/doctors", key: "nav.doctors", end: false },
  { to: "/services", key: "nav.services", end: false },
  { to: "/for-facilities", key: "nav.forFacilities", end: false },
] as const;

/** Compact EN / RW / FR select (44 px target); the full names stay in the options. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("ui");
  const id = `site-language-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const current = i18n.resolvedLanguage ?? i18n.language;
  return (
    <div className={cx("relative inline-flex items-center", className)}>
      <label htmlFor={id} className="sr-only">
        {t("language.label")}
      </label>
      <Globe
        aria-hidden="true"
        className="pointer-events-none absolute left-3 size-4 text-fg-secondary"
      />
      <select
        id={id}
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="h-10 w-[4.75rem] cursor-pointer appearance-none rounded-full border-0 bg-transparent pr-3 pl-9 text-body-sm font-semibold text-transparent uppercase transition-colors duration-150 ease-out-quint hover:bg-subtle [&>option]:text-fg [&>option]:normal-case"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {language.toUpperCase()} · {t(`language.names.${language}`)}
          </option>
        ))}
      </select>
      {/* the closed select shows only the code; the options keep the full names */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-9 text-body-sm font-semibold text-fg uppercase"
      >
        {current.slice(0, 2)}
      </span>
    </div>
  );
}

/**
 * Public header (cleaner bar, 2026-11-16): one 64 px bar, no strip above it. The logo; the pages
 * as plain text links, the current one underlined in green; then emergency (red, always there: a
 * word on wide screens, an icon below), the language code and Sign in. Below 1200 px the pages
 * move into a full-height menu that also offers "Call 912".
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [menu, setMenu] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  const open = menu.open && menu.at === pathname; // the sheet closes on every navigation

  return (
    <>
      <header className="ml-site-header sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-xl backdrop-saturate-150 print:hidden">
        {/* route loading: a thin bar while the next page's code or data loads */}
        <div
          aria-hidden="true"
          data-loading={navigation.state !== "idle"}
          className="ml-route-progress absolute inset-x-0 top-0 h-0.5 origin-left bg-primary"
        />
        <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-8 px-4 sm:px-6">
          <Link
            to="/"
            viewTransition
            aria-label={t("nav.homeLabel")}
            className="inline-flex min-h-target shrink-0 items-center rounded-sm no-underline"
          >
            <Logo className="h-8" />
          </Link>
          <nav aria-label={t("nav.label")} className="hidden min-w-0 xl:block">
            <ul className="m-0 flex list-none items-center gap-1 p-0">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    viewTransition
                    className={cx(
                      "relative inline-flex h-16 items-center px-3 text-body-sm font-medium whitespace-nowrap text-fg-secondary no-underline",
                      "transition-colors duration-200 ease-out-quint hover:text-fg",
                      "aria-[current=page]:font-semibold aria-[current=page]:text-fg",
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {t(item.key)}
                        {/* the current page: a short green line on the bar's edge, gliding
                            between items on a view transition */}
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="ml-nav-pill absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {/* emergency stays one tap away on every screen, now in the bar instead of a strip */}
            <Link
              to="/emergency"
              viewTransition
              aria-label={t("nav.strip.guide")}
              className="inline-flex size-11 items-center justify-center gap-1.5 rounded-full text-body-sm font-semibold text-danger no-underline transition-colors duration-150 hover:bg-danger-bg xl:w-auto xl:px-3"
            >
              <Siren aria-hidden="true" weight="bold" className="size-5 xl:size-4" />
              <span className="hidden xl:inline">{t("nav.strip.label")}</span>
            </Link>
            <span aria-hidden="true" className="mx-1.5 hidden h-6 w-px bg-hairline xl:block" />
            <LanguageSelect className="hidden xl:inline-flex" />
            {showLogin && (
              <Link
                to="/login"
                viewTransition
                className={buttonClassName({
                  pill: true,
                  size: "sm",
                  className: "ml-press ml-1.5 hidden h-10 px-5 xl:inline-flex",
                })}
              >
                <SignIn aria-hidden="true" weight="bold" className="size-4" />
                {t("nav.login")}
              </Link>
            )}
            <button
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
              onClick={() => setMenu({ open: !open, at: pathname })}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-fg transition-colors duration-150 ease-out-quint hover:bg-subtle xl:hidden"
            >
              <List aria-hidden="true" className="size-6" />
            </button>
          </div>
        </div>
      </header>

      {/* the menu: a full-height sheet (focus trapped, Escape closes, focus returns) */}
      <Sheet
        open={open}
        onOpenChange={(next) => setMenu({ open: next, at: pathname })}
        title={t("nav.menu")}
        closeLabel={t("nav.closeMenu")}
        side="full"
      >
        <nav aria-label={t("nav.label")} className="flex min-h-full flex-col gap-4">
          <ul className="m-0 flex list-none flex-col p-0">
            {PUBLIC_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  viewTransition
                  className="flex min-h-14 items-center border-b border-hairline px-1 font-heading text-h3 font-bold text-fg no-underline aria-[current=page]:text-primary"
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-3 pt-4">
            <a
              href="tel:912"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-danger-bg px-4 font-semibold text-danger no-underline hover:bg-danger/15"
            >
              <Phone aria-hidden="true" weight="bold" className="size-4" />
              {t("nav.strip.call")}
            </a>
            {showLogin && (
              <Link
                to="/login"
                viewTransition
                className={buttonClassName({ pill: true, className: "min-h-12" })}
              >
                <SignIn aria-hidden="true" weight="bold" className="size-4" />
                {t("nav.login")}
              </Link>
            )}
            <div className="flex min-h-12 items-center justify-between gap-3">
              <LanguageSelect />
              <ThemeSwitch />
            </div>
          </div>
        </nav>
      </Sheet>
    </>
  );
}
