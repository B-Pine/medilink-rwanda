import { Phone } from "@phosphor-icons/react";
import {
  cx,
  ImigongoPattern,
  LanguageSwitcher,
  Logo,
  MAIN_CONTENT_ID,
  SkipLink,
} from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";

/**
 * Sign-in and sign-up shell (product owner request 2026-11-02, after the "modern sign-in" layout):
 * a full-height deep-forest band with the Imigongo pattern, one centred card with the MediLink mark
 * and the form, and a short line under the card. Solid surfaces only (no glass, upgrade 02 §9),
 * tokens only, works in both themes. The top bar keeps the logo, Emergency · 912 and the language.
 */
export function AuthLayout({
  children,
  below,
  wide = false,
}: {
  children: ReactNode;
  /** One line or link under the card (e.g. "Continue without an account"). */
  below?: ReactNode;
  /** Sign-up's consent step needs a little more room than sign-in. */
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-forest text-on-forest">
      <SkipLink />
      <ImigongoPattern opacity={0.06} className="-z-10" />
      {/* a soft emerald light behind the card, so the band is not flat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-on-forest-accent)_16%,transparent),transparent)]"
      />
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6 print:hidden">
        <Link to="/" className="inline-flex min-h-target items-center rounded-sm no-underline">
          <Logo tone="onDark" className="h-8" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="tel:912"
            className="inline-flex min-h-target items-center gap-1.5 rounded-md px-2 text-body-sm font-semibold whitespace-nowrap text-on-forest no-underline hover:bg-on-forest/10"
          >
            <Phone aria-hidden="true" weight="bold" className="size-4" />
            {t("nav.emergency")}
          </a>
          <LanguageSwitcher compact onDark />
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pt-4 pb-12 focus:outline-none"
      >
        <div
          className={cx(
            "w-full animate-rise rounded-[1.75rem] bg-surface p-6 text-fg shadow-raised sm:p-8",
            wide ? "max-w-lg" : "max-w-md",
          )}
        >
          <div className="mb-6 flex justify-center">
            <span className="grid size-14 place-items-center rounded-full bg-brand-subtle shadow-card">
              <Logo variant="symbol" alt="" className="h-8" />
            </span>
          </div>
          {children}
        </div>
        {below && (
          <div className="animate-enter text-center text-body-sm text-on-forest-muted [animation-delay:120ms]">
            {below}
          </div>
        )}
      </main>
    </div>
  );
}

/** Centred card title: the page <h1> (focus after navigation, document title) and one hint line. */
export function AuthTitle({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
      <PageHeading title={title} className="text-h2 tracking-tight text-fg">
        {title}
      </PageHeading>
      {hint && <p className="m-0 text-body-sm text-fg-secondary">{hint}</p>}
    </div>
  );
}
