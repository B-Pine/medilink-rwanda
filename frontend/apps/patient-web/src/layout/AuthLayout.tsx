import {
  CalendarCheck,
  FolderOpen,
  Phone,
  ShieldCheck,
  Timer,
  type Icon,
} from "@phosphor-icons/react";
import {
  cx,
  ImigongoPattern,
  LanguageSwitcher,
  Logo,
  MAIN_CONTENT_ID,
  SkipLink,
  ThemeSwitch,
} from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";

const POINTS: readonly { key: "book" | "queue" | "records"; icon: Icon }[] = [
  { key: "book", icon: CalendarCheck },
  { key: "queue", icon: Timer },
  { key: "records", icon: FolderOpen },
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
  return (
    <div className="grid min-h-dvh bg-surface text-fg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <SkipLink />
      <div className="relative isolate hidden overflow-hidden bg-forest text-on-forest lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14 print:hidden">
        <ImigongoPattern opacity={0.07} className="-z-10 text-on-forest-accent" />
        {/* a soft emerald light low in the panel, so the band is not flat */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-32 -z-10 size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-on-forest-accent)_18%,transparent),transparent)]"
        />
        <Link
          to="/"
          viewTransition
          className="inline-flex min-h-target self-start rounded-sm no-underline"
        >
          <Logo tone="onDark" className="h-10" />
        </Link>
        <div className="flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="m-0 text-caption font-semibold tracking-wider text-on-forest-accent uppercase">
              {t("authAside.eyebrow")}
            </p>
            <p className="m-0 font-heading text-h1 tracking-tight text-balance text-on-forest">
              {t("authAside.title")}
            </p>
            <p className="m-0 text-on-forest-muted">{t("authAside.lead")}</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {POINTS.map(({ key, icon: PointIcon }) => (
              <li key={key} className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-on-forest/10 bg-forest-raised text-on-forest-accent">
                  <PointIcon aria-hidden="true" weight="duotone" className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5 pt-0.5">
                  <span className="font-semibold text-on-forest">
                    {t(`authAside.points.${key}.title`)}
                  </span>
                  <span className="text-body-sm text-on-forest-muted">
                    {t(`authAside.points.${key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 flex max-w-md items-start gap-2 text-caption text-on-forest-muted">
          <ShieldCheck aria-hidden="true" weight="bold" className="mt-px size-4 shrink-0" />
          {t("authAside.trust")}
        </p>
      </div>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center gap-2 px-4 py-4 sm:px-8 print:hidden">
          <Link
            to="/"
            viewTransition
            className="inline-flex min-h-target items-center rounded-sm no-underline lg:hidden"
          >
            <Logo className="h-8" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="tel:912"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-danger/25 bg-danger-bg/60 px-3 text-body-sm font-semibold whitespace-nowrap text-danger no-underline transition-colors duration-150 ease-out-quint hover:border-danger/50 hover:bg-danger-bg"
            >
              <Phone aria-hidden="true" weight="bold" className="size-4" />
              <span className="hidden sm:inline">{t("nav.emergency")}</span>
              <span className="sm:hidden">912</span>
            </a>
            <LanguageSwitcher pill />
            <ThemeSwitch />
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
