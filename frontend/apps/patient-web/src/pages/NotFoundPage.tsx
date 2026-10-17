import { Compass } from "@phosphor-icons/react";
import { buttonClassName } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { PublicLayout } from "../layout/PublicLayout";

export function NotFoundPage() {
  const { t } = useTranslation();
  const title = t("notFound.title");
  return (
    <PublicLayout narrow>
      <div className="flex flex-col items-start gap-4">
        <Compass aria-hidden="true" className="size-12 text-fg-muted" />
        <PageHeading title={title}>{title}</PageHeading>
        <p className="m-0 text-fg-secondary">{t("notFound.body")}</p>
        <Link to="/" className={buttonClassName({ size: "lg" })}>
          {t("notFound.home")}
        </Link>
      </div>
    </PublicLayout>
  );
}
