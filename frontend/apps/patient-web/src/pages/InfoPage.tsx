import { ArrowLeft } from "@phosphor-icons/react";
import { Badge, Card } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { PublicLayout } from "../layout/PublicLayout";

export type InfoSection = "verify" | "forFacilities" | "terms" | "privacy" | "help";

/** Placeholder public pages linked from the landing page and footer (filled in later sprints). */
export function InfoPage({ section }: { section: InfoSection }) {
  const { t } = useTranslation();
  const title = t(`info.${section}.title`);
  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-6">
        <PageHeading title={title}>{title}</PageHeading>
        <Card className="flex flex-col items-start gap-3">
          <Badge tone="info">{t("common.comingSoon")}</Badge>
          <p className="m-0 text-fg-secondary">{t(`info.${section}.body`)}</p>
        </Card>
        <Link
          to="/"
          className="inline-flex min-h-target items-center gap-2 self-start font-semibold"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          {t("info.back")}
        </Link>
      </div>
    </PublicLayout>
  );
}
