import {
  CaretRight,
  FileText,
  Lock,
  Question,
  Storefront,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Badge, Card } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";

const QUESTIONS = ["ticket", "family", "language", "data"] as const;

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
 * person, and the legal pages. "Report a problem" opens with disputes and help (roadmap S10).
 */
export function SupportPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <PageHeading title={t("support.title")}>{t("support.title")}</PageHeading>
      <EmergencyNotice />

      <Card as="section" aria-labelledby="support-faq" className="flex flex-col gap-2">
        <h2 id="support-faq" className="m-0 flex items-center gap-2 text-h3">
          <Question aria-hidden="true" weight="duotone" className="size-6 text-brand" />
          {t("support.faqTitle")}
        </h2>
        <div className="flex flex-col divide-y divide-border">
          {QUESTIONS.map((q) => (
            <details key={q} className="group py-1">
              <summary className="flex min-h-target cursor-pointer list-none items-center gap-3 rounded-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{t(`support.faq.${q}.q`)}</span>
                <CaretRight
                  aria-hidden="true"
                  className="size-5 text-fg-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
                />
              </summary>
              <p className="m-0 pb-3 text-fg-secondary">{t(`support.faq.${q}.a`)}</p>
            </details>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="support-desk" className="flex gap-4">
        <Storefront aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <h2 id="support-desk" className="m-0 text-h3">
            {t("support.deskTitle")}
          </h2>
          <p className="m-0 text-fg-secondary">{t("support.deskBody")}</p>
        </div>
      </Card>

      <Card as="section" aria-labelledby="support-report" className="flex gap-4">
        <WarningCircle aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="support-report" className="m-0 text-h3">
              {t("support.reportTitle")}
            </h2>
            <Badge tone="neutral">{t("common.comingSoon")}</Badge>
          </div>
          <p className="m-0 text-fg-secondary">{t("support.reportBody")}</p>
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
