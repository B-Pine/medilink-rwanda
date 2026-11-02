import { ArrowRight, List, MagnifyingGlass, Siren, X } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo, ThemeSwitch } from "@medilink/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigation } from "react-router";

export const PUBLIC_NAV = [
  { to: "/", key: "nav.home", end: true },
  { to: "/find-care", key: "nav.findCare", end: false },
  { to: "/facilities", key: "nav.facilities", end: false },
  { to: "/doctors", key: "nav.doctors", end: false },
  { to: "/services", key: "nav.services", end: false },
] as const;

/**
 * Public navbar (upgrade 11 §3): logo left; Home · Find Care · Facilities · Doctors · Services in
 * the centre, in a segmented track with a raised sliding indicator (How It Works lives in the
 * footer); Emergency (live dot), a language chip, a light/dark switch, Sign In and a primary Find
 * Care button on the right. Frosted
 * surface, 80 px, sticky, a subtle line that becomes a soft shadow on scroll. Below 1024 px a menu button opens a slide-down panel that locks the page
 * behind it and closes on navigation or Escape.
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [menu, setMenu] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  // the menu closes on every navigation
  const open = menu.open && menu.at === pathname;

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu({ open: false, at: pathname });
    };
    window.addEventListener("keydown", close);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open, pathname]);

  return (
    <header className="ml-site-header sticky top-0 z-30 border-b border-border/60 print:hidden">
      {/* frosted backdrop on its own layer: a filter on the header would trap the fixed menu overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-surface/85 backdrop-blur-xl backdrop-saturate-150"
      />
      {/* route loading: a thin emerald bar while the next page's code or data loads */}
      <div
        aria-hidden="true"
        data-loading={navigation.state !== "idle"}
        className="ml-route-progress absolute inset-x-0 top-0 h-0.5 origin-left bg-primary"
      />
      <div className="mx-auto flex h-20 max-w-[84rem] items-center gap-4 px-4 sm:px-6 lg:px-8 xl:gap-6">
        <Link
          to="/"
          viewTransition
          className="inline-flex min-h-target shrink-0 items-center rounded-sm pr-2 no-underline"
        >
          <Logo className="h-9 xl:h-10" />
        </Link>
        <SlidingNav />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            to="/emergency"
            viewTransition
            aria-label={t("nav.emergency")}
            className="group inline-flex h-10 items-center gap-2 rounded-full border border-danger/25 bg-danger-bg/60 px-3 text-body-sm font-semibold whitespace-nowrap text-danger no-underline transition-colors duration-150 ease-out-quint hover:border-danger/50 hover:bg-danger-bg"
          >
            {/* a live dot: the emergency line is always open */}
            <span aria-hidden="true" className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-danger-solid opacity-60 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-danger-solid" />
            </span>
            <Siren aria-hidden="true" weight="bold" className="size-4 2xl:hidden" />
            <span aria-hidden="true" className="hidden 2xl:inline">
              {t("nav.emergencyShort")}
            </span>
          </Link>
          <LanguageSwitcher pill className="hidden xl:inline-flex" />
          <ThemeSwitch className="hidden lg:inline-flex" />
          {showLogin && (
            <>
              <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border lg:block" />
              <Link
                to="/login"
                viewTransition
                className="hidden h-10 items-center rounded-full px-3.5 text-body-sm font-semibold whitespace-nowrap text-fg no-underline transition-colors duration-150 ease-out-quint hover:bg-subtle lg:inline-flex"
              >
                {t("nav.login")}
              </Link>
            </>
          )}
          <span className="hidden sm:block">
            <Link
              to="/find-care"
              viewTransition
              className={buttonClassName({
                size: "sm",
                pill: true,
                className:
                  "group min-h-10 gap-2 px-5 whitespace-nowrap shadow-card transition-[background-color,box-shadow,transform] hover:shadow-raised active:scale-[0.97] motion-reduce:active:scale-100",
              })}
            >
              <MagnifyingGlass
                aria-hidden="true"
                weight="bold"
                className="hidden size-4 xl:block"
              />
              {t("nav.findCare")}
              <ArrowRight
                aria-hidden="true"
                weight="bold"
                className="hidden size-3.5 transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5 motion-reduce:transition-none xl:block"
              />
            </Link>
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
            onClick={() => setMenu({ open: !open, at: pathname })}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-150 ease-out-quint hover:bg-subtle active:scale-[0.94] motion-reduce:active:scale-100 lg:hidden"
          >
            {open ? (
              <X aria-hidden="true" className="size-6" />
            ) : (
              <List aria-hidden="true" className="size-6" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setMenu({ open: false, at: pathname })}
            className="fixed inset-x-0 top-20 bottom-0 animate-fade bg-fg/30 lg:hidden"
          />
          <nav
            id="site-menu"
            aria-label={t("nav.label")}
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] animate-rise overflow-y-auto border-b border-border bg-surface px-4 pt-2 pb-6 shadow-raised sm:px-6 lg:hidden"
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to} className="border-b border-border/70 last:border-b-0">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    viewTransition
                    className="flex min-h-14 items-center justify-between text-h3 font-semibold text-fg no-underline aria-[current=page]:text-primary"
                  >
                    {t(item.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                to="/find-care"
                viewTransition
                className={buttonClassName({ size: "lg", pill: true, fullWidth: true })}
              >
                {t("nav.findCare")}
              </Link>
              {showLogin && (
                <Link
                  to="/login"
                  viewTransition
                  className={buttonClassName({
                    variant: "secondary",
                    size: "lg",
                    pill: true,
                    fullWidth: true,
                  })}
                >
                  {t("nav.login")}
                </Link>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <LanguageSwitcher pill />
                <ThemeSwitch />
              </span>
              <Link
                to="/emergency"
                viewTransition
                className="inline-flex min-h-target items-center gap-1.5 font-semibold text-danger"
              >
                <Siren aria-hidden="true" weight="bold" className="size-4" />
                {t("nav.emergency")}
              </Link>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}

/**
 * Desktop links with one indicator behind them: it rests on the current page and slides to the
 * link under the pointer or keyboard focus. Positioned by writing styles from handlers and a
 * layout effect, so moving it never re-renders the header.
 */
function SlidingNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const settle = () => movePill(pill.current, currentLink(element));
    settle();
    // fonts loading or the language changing resize the links
    const observer = new ResizeObserver(settle);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pathname]);

  const back = () => movePill(pill.current, currentLink(list.current));

  return (
    <nav aria-label={t("nav.label")} className="mx-auto hidden min-w-0 lg:block">
      {/* Leaving the list only returns the decorative indicator; the links stay the controls. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ul
        ref={list}
        onMouseLeave={back}
        onBlur={back}
        className="relative m-0 flex list-none items-center rounded-full border border-border/60 bg-subtle/70 p-1"
      >
        <span
          ref={pill}
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-9 -translate-y-1/2 rounded-full border border-border/60 bg-surface opacity-0 shadow-card transition-[translate,width,opacity] duration-300 ease-out-quint motion-reduce:transition-none"
        />
        {PUBLIC_NAV.map((item) => (
          // the list, not the item, is the links' offset parent so the indicator can slide
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              viewTransition
              onMouseEnter={(event) => movePill(pill.current, event.currentTarget)}
              onFocus={(event) => movePill(pill.current, event.currentTarget)}
              className="relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-body-sm font-semibold whitespace-nowrap text-fg-secondary no-underline transition-colors duration-150 ease-out-quint hover:text-fg aria-[current=page]:text-fg xl:px-4"
            >
              {t(item.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function currentLink(list: HTMLElement | null): HTMLElement | null {
  return list?.querySelector<HTMLElement>('a[aria-current="page"]') ?? null;
}

function movePill(pill: HTMLElement | null, target: HTMLElement | null) {
  if (!pill) return;
  if (!target) {
    pill.style.opacity = "0";
    return;
  }
  // `translate` composes with the -50% vertical centring of the Tailwind class
  pill.style.opacity = "1";
  pill.style.translate = `${target.offsetLeft}px -50%`;
  pill.style.width = `${target.offsetWidth}px`;
}
