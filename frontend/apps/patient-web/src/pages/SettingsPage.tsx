import {
  Bell,
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
import { PageHeader, Panel } from "../features/dashboard/kit";

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
    <Panel
      as="section"
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="scroll-mt-24"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand"
        >
          <SectionIcon weight="duotone" className="size-6" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id={`settings-${id}-title`} className="m-0 font-heading text-h3 font-bold">
            {t(`dashboard.settings.${id}.title`)}
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary">{t(`dashboard.settings.${id}.body`)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </Panel>
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
      <PageHeader title={t("settings.title")} subtitle={t("dashboard.settings.subtitle")} />
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
              <dl className="m-0 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-body-sm text-fg-muted">
                    {t("dashboard.settings.personal.name")}
                  </dt>
                  <dd className="m-0 font-semibold">{me.full_name}</dd>
                </div>
                <div>
                  <dt className="text-body-sm text-fg-muted">
                    {t("dashboard.settings.personal.email")}
                  </dt>
                  <dd className="m-0 font-semibold break-all">
                    {me.email}{" "}
                    {me.email_verified ? (
                      <Badge tone="success">{t("dashboard.settings.personal.verified")}</Badge>
                    ) : (
                      <Badge tone="warning">{t("dashboard.settings.personal.unverified")}</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            )}
            <Link to={paths.profile} className={buttonClassName({ variant: "secondary" })}>
              {t("dashboard.settings.personal.edit")}
            </Link>
          </SettingsSection>

          <SettingsSection id="display">
            <LanguageSwitcher />
            <div className="flex flex-col gap-2">
              <TextSizeToggle />
              <p className="m-0 text-body-sm text-fg-muted">{t("settings.textSizeHint")}</p>
            </div>
            <ThemeToggle />
          </SettingsSection>

          <SettingsSection id="privacy">
            <div className="flex flex-wrap gap-2">
              <Link to={paths.privacy} className={buttonClassName({ variant: "secondary" })}>
                {t("dashboard.settings.privacy.consent")}
              </Link>
              <Link to={paths.family} className={buttonClassName({ variant: "ghost" })}>
                {t("dashboard.settings.privacy.delegates")}
              </Link>
            </div>
          </SettingsSection>

          <SettingsSection id="security">
            <p className="m-0 text-body-sm text-fg-secondary">
              {t("dashboard.settings.security.password")}
            </p>
            <Link
              to="/forgot-password"
              state={{ email: me?.email }}
              className={buttonClassName({ variant: "secondary" })}
            >
              {t("dashboard.settings.security.change")}
            </Link>
            <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
              <Badge tone="neutral">{t("common.comingSoon")}</Badge>
              {t("dashboard.settings.security.later")}
            </p>
          </SettingsSection>

          <SettingsSection id="alerts">
            <Link
              to={paths.notificationSettings}
              className={buttonClassName({ variant: "secondary" })}
            >
              {t("dashboard.settings.alerts.open")}
            </Link>
            <p className="m-0 text-body-sm text-fg-muted">{t("settings.travelBody")}</p>
          </SettingsSection>

          <SettingsSection id="account">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={logout.isPending}
                iconStart={<SignOut aria-hidden="true" className="size-icon" />}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSettled: () => void navigate("/login", { replace: true }),
                  })
                }
              >
                {t("common.logout")}
              </Button>
              <Link to={paths.newRequest} className={buttonClassName({ variant: "ghost" })}>
                {t("dashboard.settings.account.close")}
              </Link>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
