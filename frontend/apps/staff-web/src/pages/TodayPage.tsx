import { CalendarCheck } from "@phosphor-icons/react";
import { Badge, Card } from "@medilink/ui";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { roleLabel } from "../facility/labels";

function todayInKigali(language: string): string {
  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "full",
      timeZone: "Africa/Kigali",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "Africa/Kigali" }).format(
      new Date(),
    );
  }
}

/** "Today" placeholder: the receptionist Today board lands in Sprint 4 (roadmap S4). */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useStaffMe();
  if (!me) return null;

  const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);
  const title = t("today.title");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading title={title}>{title}</PageHeading>
        <p className="m-0 text-fg-muted">{todayInKigali(i18n.resolvedLanguage ?? "en")}</p>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-h2">{t("today.greeting", { name: me.full_name })}</h2>
        <p className="m-0 text-fg-secondary">
          {membership
            ? t("today.facility", { facility: membership.facility.name })
            : t("today.platform")}
        </p>
        {membership && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm font-semibold text-fg-secondary">
              {t("today.rolesLabel")}
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {membership.roles.map((role) => (
                <li key={role}>
                  <Badge tone="brand">{roleLabel(role, t)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card className="flex items-start gap-4 border-dashed">
        <CalendarCheck aria-hidden="true" className="size-8 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-h3">{t("today.placeholderTitle")}</h2>
          <p className="m-0 text-fg-secondary">{t("today.placeholderBody")}</p>
        </div>
      </Card>
    </div>
  );
}
