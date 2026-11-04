import { ArrowRight, Globe, List, Phone, Siren, SignIn, X } from "@phosphor-icons/react";
import { cx, Logo, ThemeSwitch } from "@medilink/ui";
import { SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigation } from "react-router";

export const PUBLIC_NAV = [
  { to: "/find-care", key: "nav.findCare", end: false },
  { to: "/facilities", key: "nav.facilities", end: false },
  { to: "/doctors", key: "nav.doctors", end: false },
  { to: "/services", key: "nav.services", end: false },
  { to: "/for-facilities", key: "nav.forFacilities", end: false },
] as const;

/** Compact EN / RW / FR select (44 px target); the full names stay in the options. */
function LanguageSelect({ className }: { className?: string }) {
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
 * Emergency strip (redesign §Header): the one red on the page, above the header and never sticky.
 * Calling 912 is one tap on a phone.
 */
function EmergencyStrip() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-danger/10 bg-danger-bg/70 print:hidden">
      <div className="mx-auto flex min-h-9 max-w-[88rem] flex-wrap items-center justify-between gap-x-4 px-4 text-caption sm:px-6">
        <p className="m-0 flex items-center gap-2 text-fg-secondary">
          <Siren aria-hidden="true" weight="bold" className="size-3.5 shrink-0 text-danger" />
          <span className="hidden sm:inline">{t("nav.strip.long")}</span>
          <span className="sm:hidden">{t("nav.strip.short")}</span>
          <a
            href="tel:912"
            className="inline-flex min-h-9 items-center gap-1 font-bold text-danger underline-offset-4 hover:underline"
          >
            <Phone aria-hidden="true" weight="bold" className="size-3" />
            {t("nav.strip.call")}
          </a>
          <span className="hidden md:inline">{t("nav.strip.free")}</span>
        </p>
        <Link
          to="/emergency"
          viewTransition
          className="inline-flex min-h-9 items-center gap-1 font-semibold text-danger no-underline hover:underline"
        >
          {t("nav.strip.guide")}
          <ArrowRight aria-hidden="true" weight="bold" className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Public header (second pass, 2026-11-04): a slim emergency line, then a translucent 64 px bar on
 * a hairline: the logo, the five pages as one segmented group (the current page is the raised
 * pill), a quiet language control and Sign in as the one solid button. Below 1200 px the bar keeps
 * the logo, an emergency icon and the menu button; everything else lives in a slide-out sheet.
 * The theme switch lives in the sheet and the footer.
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [menu, setMenu] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  const open = menu.open && menu.at === pathname; // the sheet closes on every navigation
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const close = () => setMenu({ open: false, at: pathname });

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trigger = button.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu({ open: false, at: pathname });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open, pathname]);

  return (
    <>
      <EmergencyStrip />
      <header className="ml-site-header sticky top-0 z-30 border-b border-hairline bg-surface/80 backdrop-blur-xl backdrop-saturate-150 print:hidden">
        {/* route loading: a thin bar while the next page's code or data loads */}
        <div
          aria-hidden="true"
          data-loading={navigation.state !== "idle"}
          className="ml-route-progress absolute inset-x-0 top-0 h-0.5 origin-left bg-primary"
        />
        <div className="mx-auto grid h-16 max-w-[88rem] grid-cols-[auto_1fr_auto] items-center gap-6 px-4 sm:px-6">
          <Link
            to="/"
            viewTransition
            aria-label={t("nav.homeLabel")}
            className="inline-flex min-h-target shrink-0 items-center rounded-sm no-underline"
          >
            <Logo className="h-8" />
          </Link>
          <nav aria-label={t("nav.label")} className="hidden min-w-0 justify-self-center xl:block">
            {/* one segmented group; the current page is the raised pill */}
            <ul className="m-0 flex list-none items-center gap-0.5 rounded-full bg-subtle/70 p-1 shadow-[inset_0_0_0_1px_var(--site-hairline)]">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    viewTransition
                    className={cx(
                      "inline-flex h-9 items-center rounded-full px-4 text-body-sm font-medium whitespace-nowrap text-fg-secondary no-underline",
                      "transition-[color,background-color,box-shadow] duration-200 ease-out-quint hover:text-fg",
                      "aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-fg aria-[current=page]:shadow-e1",
                    )}
                  >
                    {t(item.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="col-start-3 flex shrink-0 items-center gap-1.5">
            <LanguageSelect className="hidden xl:inline-flex" />
            {showLogin && (
              <Link
                to="/login"
                viewTransition
                className="hidden h-10 items-center gap-2 rounded-full bg-forest px-5 text-body-sm font-semibold whitespace-nowrap text-on-forest no-underline shadow-e1 transition-[filter,box-shadow] duration-200 ease-out-quint hover:shadow-e2 hover:brightness-110 xl:inline-flex"
              >
                <SignIn aria-hidden="true" weight="bold" className="size-4" />
                {t("nav.login")}
              </Link>
            )}
            <Link
              to="/emergency"
              viewTransition
              aria-label={t("nav.emergency")}
              className="inline-flex size-11 items-center justify-center rounded-full bg-danger-bg text-danger no-underline transition-colors duration-150 hover:bg-danger/15 xl:hidden"
            >
              <Siren aria-hidden="true" weight="bold" className="size-5" />
            </Link>
            <button
              ref={button}
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

      {open && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0 animate-fade bg-fg/35"
          />
          <nav
            ref={sheet}
            id="site-menu"
            aria-label={t("nav.label")}
            className="absolute inset-y-0 right-0 flex w-[min(22rem,100%)] animate-enter flex-col overflow-y-auto bg-surface shadow-e3"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-4">
              <Logo className="h-8" />
              <button
                type="button"
                onClick={close}
                aria-label={t("nav.closeMenu")}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-fg hover:bg-subtle"
              >
                <X aria-hidden="true" className="size-6" />
              </button>
            </div>
            <ul className="m-0 flex list-none flex-col p-2">
              {[{ to: "/", key: "nav.home", end: true }, ...PUBLIC_NAV].map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    viewTransition
                    className="flex min-h-12 items-center rounded-xl px-3 text-body font-semibold text-fg no-underline hover:bg-subtle aria-[current=page]:bg-brand-subtle aria-[current=page]:text-primary"
                  >
                    {t(item.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-3 border-t border-hairline p-4">
              {showLogin && (
                <Link
                  to="/login"
                  viewTransition
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-4 font-semibold text-on-forest no-underline shadow-e1 hover:brightness-110"
                >
                  <SignIn aria-hidden="true" weight="bold" className="size-4" />
                  {t("nav.login")}
                </Link>
              )}
              <div className="flex min-h-12 items-center justify-between gap-3">
                <LanguageSelect />
                <ThemeSwitch />
              </div>
              <Link
                to="/emergency"
                viewTransition
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-danger-bg px-3 font-semibold text-danger no-underline"
              >
                <Siren aria-hidden="true" weight="bold" className="size-5" />
                {t("nav.strip.guide")}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
