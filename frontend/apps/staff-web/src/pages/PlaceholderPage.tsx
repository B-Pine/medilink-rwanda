import { EmptyState } from "@medilink/ui";
import { Hammer } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useStaffMe } from "../auth/queries";
import { PageHeader } from "../components/PageHeader";
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
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title={t("placeholder.heading", { section: title })}
        description={t("placeholder.body")}
        action={
          <Link to="/today" className="font-semibold">
            {t("placeholder.back")}
          </Link>
        }
      />
    </div>
  );
}
