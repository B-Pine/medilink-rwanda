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
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkipLink />
      <aside
        aria-label={t("app.name")}
        className="relative overflow-hidden bg-forest px-6 py-5 text-on-forest print:hidden lg:px-12 lg:py-12"
      >
        <ImigongoPattern opacity={0.06} />
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
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
