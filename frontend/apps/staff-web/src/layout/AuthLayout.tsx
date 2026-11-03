import { ShieldCheck } from "@phosphor-icons/react";
import { ImigongoPattern, LanguageSwitcher, Logo, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Split screen for login and account flows (design 05 §2): deep forest brand panel
 * (emerald-950 + Imigongo line pattern at 6%) and the form side with the language switch on top.
 * On small screens the brand panel collapses to a header strip.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="ml-soft min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkipLink />
      <aside
        aria-label={t("app.name")}
        className="relative overflow-hidden bg-[linear-gradient(160deg,var(--color-forest)_0%,var(--color-forest-raised)_100%)] px-6 py-5 text-on-forest print:hidden lg:px-12 lg:py-12"
      >
        <ImigongoPattern opacity={0.06} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-on-forest-accent)_18%,transparent),transparent)]"
        />
        <div className="relative flex h-full flex-col gap-8">
          <Logo tone="onDark" className="h-10 lg:h-14" />
          <div className="hidden flex-col gap-4 lg:my-auto lg:flex">
            <p className="m-0 max-w-md font-heading text-display font-bold text-balance">
              {t("brand.tagline")}
            </p>
            <p className="m-0 max-w-md text-on-forest-muted">{t("brand.description")}</p>
          </div>
          <p className="m-0 hidden items-center gap-2 text-on-forest-muted lg:flex">
            <ShieldCheck aria-hidden="true" weight="bold" className="size-5 shrink-0" />
            {t("brand.trust")}
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex justify-end px-4 py-3 print:hidden sm:px-6">
          <LanguageSwitcher />
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:px-6 lg:items-center lg:pt-0"
        >
          <div className="w-full max-w-md animate-rise rounded-3xl bg-surface p-6 shadow-raised sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
