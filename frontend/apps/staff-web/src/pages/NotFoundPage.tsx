import { Compass, LockKey } from "@phosphor-icons/react";
import { buttonClassName, LanguageSwitcher, Logo, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";

/** 404 body: an address or record that does not exist. */
export function NotFoundContent() {
  const { t } = useTranslation();
  const title = t("notFound.title");
  return (
    <div className="flex flex-col items-start gap-4">
      <Compass aria-hidden="true" className="size-12 text-fg-muted" />
      <PageHeading title={title}>{title}</PageHeading>
      <p className="m-0 text-fg-secondary">{t("notFound.body")}</p>
      <Link to="/" className={buttonClassName({ variant: "primary" })}>
        {t("notFound.home")}
      </Link>
    </div>
  );
}

/**
 * A section this person's role does not include (analysis 02 §3). Says so plainly instead of
 * pretending the page does not exist, and points back to their own work.
 */
export function NoAccessContent() {
  const { t } = useTranslation();
  const title = t("noAccess.title");
  return (
    <div className="flex max-w-xl flex-col items-start gap-4 py-8">
      <span className="grid size-12 place-items-center rounded-lg bg-subtle text-fg-muted">
        <LockKey aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <PageHeading title={title}>{title}</PageHeading>
      <p className="m-0 text-fg-muted">{t("noAccess.body")}</p>
      <Link to="/" className={buttonClassName({ variant: "primary" })}>
        {t("noAccess.home")}
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
