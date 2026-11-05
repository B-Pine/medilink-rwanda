import {
  Bell,
  CaretRight,
  IdentificationCard,
  Key,
  Palette,
  ShieldCheck,
  SignOut,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  buttonClassName,
  cx,
  LanguageSwitcher,
  SectionAnchors,
  TextSizeToggle,
  ThemeToggle,
} from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { paths } from "../app/paths";
import { useLogout, usePatientMe } from "../auth/queries";
import { Avatar, PageHeader, panelClass } from "../features/dashboard/kit";

const SECTIONS = ["personal", "display", "privacy", "security", "alerts", "account"] as const;
const ICON: Record<(typeof SECTIONS)[number], Icon> = {
  personal: UserCircle,
  display: Palette,
  privacy: ShieldCheck,
  security: Key,
  alerts: Bell,
  account: IdentificationCard,
};

function SettingsSection({ id, children }: { id: (typeof SECTIONS)[number]; children: ReactNode }) {
  const { t } = useTranslation();
  const SectionIcon = ICON[id];
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className={cx(panelClass, "scroll-mt-24 overflow-hidden")}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand"
        >
          <SectionIcon weight="duotone" className="size-5" />
        </span>
        <h2 id={`settings-${id}-title`} className="m-0 font-heading text-body font-bold">
          {t(`dashboard.settings.${id}.title`)}
        </h2>
      </div>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

/** One setting: what it is on the left, its control or link on the right (stacked on phones). */
function SettingRow({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      {(label || hint) && (
        <div className="flex min-w-0 flex-col gap-0.5">
          {label && <p className="m-0 font-semibold text-fg">{label}</p>}
          {hint && <div className="m-0 text-body-sm text-fg-secondary">{hint}</div>}
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Settings (upgrade 12 §14): a section list beside the page on wide screens, stacked on phones.
 * Each section edits what this app can edit and links to where the rest is kept; nothing here
 * changes who may see a record beyond what the privacy rules allow.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: me } = usePatientMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} />
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <SectionAnchors
          label={t("dashboard.settings.sections")}
          sections={SECTIONS.map((id) => ({
            id: `settings-${id}`,
            label: t(`dashboard.settings.${id}.title`),
          }))}
          className="hidden lg:sticky lg:top-24 lg:block"
        />
        <div className="flex min-w-0 max-w-[44rem] flex-col gap-6">
          <SettingsSection id="personal">
            {me && (
              <div className="flex items-center gap-4 px-5 py-4">
                <Avatar name={me.full_name} size="lg" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 font-heading text-h3 font-bold text-fg">{me.full_name}</p>
                  <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm break-all text-fg-secondary">
                    <span className="sr-only">{t("dashboard.settings.personal.email")}: </span>
                    {me.email}
                    {me.email_verified ? (
                      <Badge tone="success">{t("dashboard.settings.personal.verified")}</Badge>
                    ) : (
                      <Badge tone="warning">{t("dashboard.settings.personal.unverified")}</Badge>
                    )}
                  </p>
                </div>
              </div>
            )}
            <SettingRow label={t("dashboard.settings.personal.name")}>
              <Link
                to={paths.profile}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.settings.personal.edit")}
                <CaretRight aria-hidden="true" className="size-4" />
              </Link>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="display">
            <SettingRow label={t("dashboard.nav.language")}>
              <LanguageSwitcher pill />
            </SettingRow>
            <div className="px-5 py-4">
              <TextSizeToggle />
            </div>
            <div className="px-5 py-4">
              <ThemeToggle />
            </div>
          </SettingsSection>

          <SettingsSection id="privacy">
            <SettingRow label={t("dashboard.settings.privacy.consent")}>
              <Link
                to={paths.privacy}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.settings.alerts.openShort")}
                <CaretRight aria-hidden="true" className="size-4" />
              </Link>
            </SettingRow>
            <SettingRow label={t("dashboard.settings.privacy.delegates")}>
              <Link
                to={paths.family}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.settings.alerts.openShort")}
                <CaretRight aria-hidden="true" className="size-4" />
              </Link>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="security">
            <SettingRow label={t("dashboard.settings.security.change")}>
              <Link
                to="/forgot-password"
                state={{ email: me?.email }}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.settings.alerts.openShort")}
                <CaretRight aria-hidden="true" className="size-4" />
              </Link>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="alerts">
            <SettingRow label={t("dashboard.settings.alerts.open")}>
              <Link
                to={paths.notificationSettings}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.settings.alerts.openShort")}
                <CaretRight aria-hidden="true" className="size-4" />
              </Link>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="account">
            <SettingRow>
              <Button
                variant="secondary"
                size="sm"
                loading={logout.isPending}
                iconStart={<SignOut aria-hidden="true" className="size-4" />}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSettled: () => void navigate("/login", { replace: true }),
                  })
                }
              >
                {t("common.logout")}
              </Button>
              <Link
                to={paths.newRequest}
                className={buttonClassName({
                  variant: "ghost",
                  size: "sm",
                  className: "text-danger",
                })}
              >
                {t("dashboard.settings.account.close")}
              </Link>
            </SettingRow>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
