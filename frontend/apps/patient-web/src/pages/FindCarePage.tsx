import {
  CalendarPlus,
  ChatCircleText,
  MagnifyingGlass,
  PersonSimpleWalk,
  Ticket,
  type Icon,
} from "@phosphor-icons/react";
import { Badge, buttonClassName, cx } from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";

function Option({
  id,
  icon: OptionIcon,
  title,
  badge,
  children,
  tone = "default",
}: {
  id?: string;
  icon: Icon;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  tone?: "default" | "primary";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id ?? title}-title`}
      className={cx(
        "flex scroll-mt-24 gap-4 rounded-lg border p-5",
        tone === "primary" ? "border-brand bg-brand-subtle" : "border-border bg-surface",
      )}
    >
      <span
        className={cx(
          "inline-flex size-12 shrink-0 items-center justify-center rounded-full",
          tone === "primary" ? "bg-surface text-brand" : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        <OptionIcon aria-hidden="true" weight="duotone" className="size-7" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id ?? title}-title`} className="m-0 text-h3">
            {title}
          </h2>
          {badge}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * Find care (design 07 §2, §3.2). Today a patient joins the queue at reception and follows the
 * ticket here; booking a time and describing symptoms open with online booking (roadmap S5, P2).
 */
export function FindCarePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <PageHeading title={t("findCare.title")}>{t("findCare.title")}</PageHeading>
        <p className="m-0 text-fg-secondary">{t("findCare.intro")}</p>
      </div>

      <Option icon={PersonSimpleWalk} title={t("findCare.walkIn.title")} tone="primary">
        <p className="m-0 text-fg-secondary">{t("findCare.walkIn.body")}</p>
        <ol className="m-0 flex flex-col gap-2 pl-0">
          {(["reception", "ticket", "track"] as const).map((step, index) => (
            <li key={step} className="flex list-none items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-on-primary tabular-nums"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{t(`findCare.walkIn.steps.${step}`)}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 inline-flex items-center gap-2 text-body-sm text-fg-muted">
          <Ticket aria-hidden="true" className="size-5" />
          {t("findCare.walkIn.note")}
        </p>
      </Option>

      <Option icon={CalendarPlus} title={t("findCare.book.title")}>
        <p className="m-0 text-fg-secondary">{t("findCare.book.body")}</p>
        <Link to="/search" className={buttonClassName({ size: "lg" })}>
          <MagnifyingGlass aria-hidden="true" className="size-icon" />
          {t("findCare.book.action")}
        </Link>
      </Option>

      <Option
        id="symptoms"
        icon={ChatCircleText}
        title={t("findCare.symptoms.title")}
        badge={<Badge tone="neutral">{t("common.comingSoon")}</Badge>}
      >
        <p className="m-0 text-fg-secondary">{t("findCare.symptoms.body")}</p>
      </Option>

      <EmergencyNotice />
    </div>
  );
}
