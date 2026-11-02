import { List, Phone, SignIn, X } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo } from "@medilink/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigation } from "react-router";

const NAV = [
  { to: "/care", key: "nav.findCare" },
  { to: "/check-symptoms", key: "nav.checkSymptoms" },
  { to: "/for-facilities", key: "nav.forFacilities" },
] as const;

/**
 * Public header (upgrade 03 §1): logo, Find care, Check symptoms, For facilities, Emergency · 912,
 * language and Sign in. It stays on top while the page scrolls and gains a shadow once the page
 * moves (a scroll-driven animation where supported). A pill slides to the link under the pointer
 * and back to the current page. On phones the links open in a panel. Links use view transitions,
 * so the page cross-fades while the header stays still (`view-transition-name: site-header`).
 */
export function PublicHeader({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [menu, setMenu] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  // the phone menu closes on every navigation
  const open = menu.open && menu.at === pathname;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu({ open: false, at: pathname });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, pathname]);

  return (
    <header className="ml-site-header sticky top-0 z-30 border-b border-border/60 bg-surface print:hidden">
      {/* route loading: a thin emerald bar while the next page's code or data loads */}
      <div
        aria-hidden="true"
        data-loading={navigation.state !== "idle"}
        className="ml-route-progress absolute inset-x-0 top-0 h-0.5 origin-left bg-primary"
      />
      <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-6 px-4 sm:px-6">
        <Link
          to="/"
          viewTransition
          className="inline-flex min-h-target shrink-0 items-center rounded-sm no-underline"
        >
          <Logo className="h-9" />
        </Link>
        <SlidingNav />
        <div className="ml-auto flex items-center gap-2">
          <a
            href="tel:912"
            className="inline-flex min-h-target items-center gap-1.5 rounded-full bg-danger-bg px-3 text-body-sm font-semibold whitespace-nowrap text-danger no-underline transition-[filter,transform] duration-150 ease-out-quint hover:brightness-95 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <Phone aria-hidden="true" weight="bold" className="size-4" />
            <span className="hidden sm:inline">{t("nav.emergency")}</span>
            <span className="sm:hidden">912</span>
          </a>
          <span className="hidden md:block">
            <LanguageSwitcher compact />
          </span>
          {showLogin && (
            <span className="hidden md:block">
              <Link
                to="/login"
                viewTransition
                className={buttonClassName({ size: "sm", pill: true, className: "px-4" })}
              >
                <SignIn aria-hidden="true" className="size-4" />
                {t("nav.login")}
              </Link>
            </span>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={t("nav.menu")}
            onClick={() => setMenu({ open: !open, at: pathname })}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-150 ease-out-quint hover:bg-subtle active:scale-[0.94] motion-reduce:active:scale-100 md:hidden"
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
        <nav
          id="site-menu"
          aria-label={t("nav.label")}
          className="absolute inset-x-0 top-full animate-rise border-b border-border bg-surface px-4 pt-2 pb-5 shadow-raised md:hidden"
        >
          <ul className="m-0 flex list-none flex-col p-0">
            {NAV.map((item) => (
              <li key={item.to} className="border-b border-border last:border-b-0">
                <NavLink
                  to={item.to}
                  viewTransition
                  className="flex min-h-14 items-center text-h3 font-semibold text-fg no-underline aria-[current=page]:text-primary"
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <LanguageSwitcher compact />
            {showLogin && (
              <Link to="/login" viewTransition className={buttonClassName({ pill: true })}>
                <SignIn aria-hidden="true" className="size-icon" />
                {t("nav.login")}
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

/**
 * Desktop links with one pill behind them: it sits on the current page's link and slides to the
 * link under the pointer or keyboard focus. Positioned by writing styles in handlers and a layout
 * effect, so moving it never re-renders the header.
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
    <nav aria-label={t("nav.label")} className="hidden md:block">
      {/* Leaving the list only returns the decorative pill to the current page; links stay the controls. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ul
        ref={list}
        onMouseLeave={back}
        onBlur={back}
        className="relative m-0 flex list-none items-center p-0"
      >
        <span
          ref={pill}
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-10 -translate-y-1/2 rounded-full bg-subtle opacity-0 transition-[translate,width,opacity] duration-250 ease-out-quint motion-reduce:transition-none"
        />
        {NAV.map((item) => (
          <li key={item.to} className="relative">
            <NavLink
              to={item.to}
              viewTransition
              onMouseEnter={(event) => movePill(pill.current, event.currentTarget)}
              onFocus={(event) => movePill(pill.current, event.currentTarget)}
              className="inline-flex min-h-10 items-center rounded-full px-4 text-body-sm font-semibold whitespace-nowrap text-fg-secondary no-underline transition-colors duration-150 ease-out-quint hover:text-fg aria-[current=page]:text-fg"
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
