import { Compass } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";

/** 404 body, also used inside the shell for sections the user's role cannot see. */
export function NotFoundContent() {
  const { t } = useTranslation();
  const title = t("notFound.title");
  return (
    <div className="flex flex-col items-start gap-4">
      <Compass aria-hidden="true" className="size-12 text-fg-muted" />
      <PageHeading title={title}>{title}</PageHeading>
      <p className="m-0 text-fg-secondary">{t("notFound.body")}</p>
      <Link to="/today" className={buttonClassName({ variant: "primary" })}>
        {t("notFound.home")}
      </Link>
    </div>
  );
}

/** Standalone 404 page for unknown addresses. */
export function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-page">
      <SkipLink />
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-8">
        <Logo className="h-9" />
        <LanguageSwitcher compact />
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-2xl px-4 py-16 sm:px-8">
        <NotFoundContent />
      </main>
    </div>
  );
}
