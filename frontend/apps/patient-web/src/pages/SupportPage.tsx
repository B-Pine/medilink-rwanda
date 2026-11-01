import { CaretRight, FileText, Lock, Question, Storefront, type Icon } from "@phosphor-icons/react";
import { Card } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";
// [S10 imports]
import { HelpCenter } from "../features/help";
// [/S10 imports]

function Row({ to, icon: RowIcon, label }: { to: string; icon: Icon; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-target items-center gap-3 rounded-md p-2 text-fg no-underline hover:bg-subtle"
      >
        <RowIcon aria-hidden="true" weight="duotone" className="size-6 text-brand" />
        <span className="flex-1 font-semibold">{label}</span>
        <CaretRight aria-hidden="true" className="size-5 text-fg-muted" />
      </Link>
    </li>
  );
}

/**
 * Help (design 07 §2, §3.5): emergency first, answers to common questions, where to ask in
 * person, and the legal pages. S10 adds searchable articles and support requests.
 */
export function SupportPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <PageHeading title={t("support.title")}>{t("support.title")}</PageHeading>
      <EmergencyNotice />

      {/* [S10] searchable help articles and support requests (sprint-10 S10-D5) */}
      <HelpCenter />
      {/* [/S10] */}

      <Card as="section" aria-labelledby="support-desk" className="flex gap-4">
        <Storefront aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <h2 id="support-desk" className="m-0 text-h3">
            {t("support.deskTitle")}
          </h2>
          <p className="m-0 text-fg-secondary">{t("support.deskBody")}</p>
        </div>
      </Card>

      <nav aria-label={t("support.more")}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <Row to="/help" icon={Question} label={t("support.guides")} />
          <Row to="/privacy" icon={Lock} label={t("support.privacy")} />
          <Row to="/terms" icon={FileText} label={t("support.terms")} />
        </ul>
      </nav>
    </div>
  );
}
