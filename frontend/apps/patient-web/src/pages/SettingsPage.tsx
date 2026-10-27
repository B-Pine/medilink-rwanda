import { Bell, PersonSimpleWalk } from "@phosphor-icons/react";
import { Badge, Card, LanguageSwitcher, TextSizeToggle, ThemeToggle } from "@medilink/ui";
import { useTranslation } from "react-i18next";

import { PageHeading } from "../components/PageHeading";

/**
 * Settings (design 07 §3.5): language, text size and theme apply at once and stay on this device.
 * Notification choices open with notifications (roadmap S9); travel time is set per facility on
 * the live tracker.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <PageHeading title={t("settings.title")}>{t("settings.title")}</PageHeading>
        <p className="m-0 text-fg-secondary">{t("settings.intro")}</p>
      </div>

      <Card as="section" aria-labelledby="settings-display" className="flex flex-col gap-5">
        <h2 id="settings-display" className="m-0 text-h3">
          {t("settings.display")}
        </h2>
        <LanguageSwitcher />
        <div className="flex flex-col gap-2">
          <TextSizeToggle />
          <p className="m-0 text-body-sm text-fg-muted">{t("settings.textSizeHint")}</p>
        </div>
        <ThemeToggle />
      </Card>

      <Card as="section" aria-labelledby="settings-travel" className="flex gap-4">
        <PersonSimpleWalk
          aria-hidden="true"
          weight="duotone"
          className="size-8 shrink-0 text-brand"
        />
        <div className="flex flex-col gap-1">
          <h2 id="settings-travel" className="m-0 text-h3">
            {t("settings.travelTitle")}
          </h2>
          <p className="m-0 text-fg-secondary">{t("settings.travelBody")}</p>
        </div>
      </Card>

      <Card as="section" aria-labelledby="settings-alerts" className="flex gap-4">
        <Bell aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="settings-alerts" className="m-0 text-h3">
              {t("settings.alertsTitle")}
            </h2>
            <Badge tone="neutral">{t("common.comingSoon")}</Badge>
          </div>
          <p className="m-0 text-fg-secondary">{t("settings.alertsBody")}</p>
        </div>
      </Card>
    </div>
  );
}
