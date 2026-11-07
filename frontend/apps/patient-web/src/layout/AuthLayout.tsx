import { Phone, ShieldCheck } from "@phosphor-icons/react";
import { cx, Logo, MAIN_CONTENT_ID, SkipLink, ThemeSwitch } from "@medilink/ui";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { LanguageSelect } from "./PublicHeader";

import { PageHeading } from "../components/PageHeading";

const POINTS: readonly { key: "book" | "queue" | "records" }[] = [
  { key: "book" },
  { key: "queue" },
  { key: "records" },
];

/**
 * Sign-in and sign-up shell (product owner request 2026-11-02): a split screen. From `lg` a
 * deep-forest brand panel with the Imigongo pattern sits on the left with what an account gives
 * (book ahead, follow the queue, records in one place) and the privacy line; the form sits on a
 * plain surface on the right, with Emergency · 912, the language and the light/dark switch on top
 * and the legal links underneath. On phones only the form side shows. Tokens only, both themes.
 */
export function AuthLayout({
  children,
  below,
  wide = false,
}: {
  children: ReactNode;
  /** One line or link under the form (e.g. "Continue without an account"). */
  below?: ReactNode;
  /** Sign-up's consent step needs a little more room than sign-in. */
  wide?: boolean;
}) {
  const { t } = useTranslation();
  // the sign-in screens wear the public site's "clinical calm" palette too (tokens.css)
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = "site";
    return () => {
      if (root.dataset.surface === "site") delete root.dataset.surface;
    };
  }, []);
  return (
    <div className="grid min-h-dvh bg-surface text-fg lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <SkipLink />
      {/* a landmark, so nothing on the page sits outside one (axe "region") */}
      <aside
        aria-label={t("authAside.label")}
        className="relative isolate hidden overflow-hidden bg-forest text-on-forest lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14 print:hidden"
      >
        <Link
          to="/"
          viewTransition
          className="inline-flex min-h-target self-start rounded-sm no-underline"
        >
          <Logo tone="onDark" className="h-10" />
        </Link>
        <div className="flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="m-0 font-heading text-h1 tracking-tight text-balance text-on-forest">
              {t("authAside.title")}
            </p>
            <p className="m-0 text-on-forest-muted">{t("authAside.lead")}</p>
          </div>
          {/* three plain lines, divided by hairlines: no icon tiles */}
          <ul className="m-0 flex list-none flex-col divide-y divide-on-forest/10 border-y border-on-forest/10 p-0">
            {POINTS.map(({ key }) => (
              <li key={key} className="flex flex-col gap-0.5 py-4">
                <span className="font-semibold text-on-forest">
                  {t(`authAside.points.${key}.title`)}
                </span>
                <span className="text-body-sm text-on-forest-muted">
                  {t(`authAside.points.${key}.body`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 flex max-w-md items-start gap-2 text-caption text-on-forest-muted">
          <ShieldCheck aria-hidden="true" weight="bold" className="mt-px size-4 shrink-0" />
          {t("authAside.trust")}
        </p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center gap-2 px-4 py-4 sm:px-8 print:hidden">
          <Link
            to="/"
            viewTransition
            aria-label={t("nav.homeLabel")}
            className="inline-flex min-h-target shrink-0 items-center rounded-sm no-underline lg:hidden"
          >
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <a
              href="tel:912"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-danger/25 bg-danger-bg/60 px-3 text-body-sm font-semibold whitespace-nowrap text-danger no-underline transition-colors duration-150 ease-out-quint hover:border-danger/50 hover:bg-danger-bg"
            >
              <Phone aria-hidden="true" weight="bold" className="size-4" />
              <span className="hidden sm:inline">{t("nav.emergency")}</span>
              <span className="sm:hidden">912</span>
            </a>
            {/* the language as a code (RW / EN / FR), as in the site header: fits a 320 px phone */}
            <LanguageSelect />
            {/* phones keep 912 and the language; the theme follows the system there */}
            <span className="hidden sm:inline-flex">
              <ThemeSwitch />
            </span>
          </div>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex flex-1 flex-col items-center justify-center px-4 py-8 focus:outline-none sm:px-8"
        >
          <div
            className={cx(
              "flex w-full animate-rise flex-col gap-8",
              wide ? "max-w-lg" : "max-w-sm",
            )}
          >
            <div>{children}</div>
            {below && (
              <div className="animate-enter border-t border-border pt-6 text-center text-body-sm text-fg-secondary [animation-delay:120ms]">
                {below}
              </div>
            )}
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-5 text-caption text-fg-muted sm:px-8 print:hidden">
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
          <Link to="/privacy" className="text-fg-muted no-underline hover:text-fg hover:underline">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="text-fg-muted no-underline hover:text-fg hover:underline">
            {t("footer.terms")}
          </Link>
          <Link to="/help" className="text-fg-muted no-underline hover:text-fg hover:underline">
            {t("footer.help")}
          </Link>
        </footer>
      </div>
    </div>
  );
}

/** Form title: the page <h1> (focus after navigation, document title) and one hint line. */
export function AuthTitle({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <PageHeading title={title} className="text-h1 tracking-tight text-fg">
        {title}
      </PageHeading>
      {hint && <p className="m-0 text-fg-secondary">{hint}</p>}
    </div>
  );
}
