import { Card } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { NAV_ITEMS, navLabelKey } from "../layout/navigation";
import { NotFoundContent } from "./NotFoundPage";

/** Sections that arrive in later sprints. Hidden (404) when the user's role cannot use them. */
export function PlaceholderPage({ section }: { section: string }) {
  const { t } = useTranslation();
  const { data: me } = useStaffMe();
  const item = NAV_ITEMS.find((entry) => entry.key === section);
  if (!me || !item) return null;
  if (!item.visible(me)) return <NotFoundContent />;

  const title = t(navLabelKey(item));
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={title}>{title}</PageHeading>
      <Card className="flex flex-col items-start gap-3 border-dashed">
        <p className="m-0 text-fg-secondary">{t("placeholder.body")}</p>
        <Link to="/today" className="font-semibold">
          {t("placeholder.back")}
        </Link>
      </Card>
    </div>
  );
}
