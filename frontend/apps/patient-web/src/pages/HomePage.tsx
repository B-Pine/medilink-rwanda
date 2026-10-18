import { CalendarBlank, MagnifyingGlass, SignOut } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  buttonClassName,
  Card,
  LanguageSwitcher,
  Logo,
  MAIN_CONTENT_ID,
  SkipLink,
  ThemeToggle,
} from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { FEATURE_HEADER_ITEMS, FEATURE_HOME_CARDS } from "../app/features";
import { useLogout, usePatientMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { EmergencyNotice } from "../layout/EmergencyNotice";

/** Patient home placeholder (design 07 §3.1): greeting, Find care, next visit, display settings. */
export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = usePatientMe();
  const logout = useLogout();
  if (!me) return null;

  const onLogout = () => {
    logout.mutate(undefined, { onSettled: () => void navigate("/login", { replace: true }) });
  };

  const title = t("home.title");
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[40rem] flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
          <Link
            to="/home"
            className="inline-flex min-h-target items-center rounded-sm no-underline"
          >
            <Logo className="h-10" />
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LanguageSwitcher compact />
            {FEATURE_HEADER_ITEMS().map((Item, index) => (
              <Item key={index} />
            ))}
            <Button
              variant="ghost"
              onClick={onLogout}
              loading={logout.isPending}
              iconStart={<SignOut aria-hidden="true" className="size-icon" />}
            >
              {logout.isPending ? t("common.loggingOut") : t("common.logout")}
            </Button>
          </div>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-1">
          <p className="m-0 text-body-sm text-fg-muted">
            {t("home.accountLabel", { name: me.full_name })}
          </p>
          <PageHeading title={title}>{t("home.greeting", { name: me.full_name })}</PageHeading>
          <p className="m-0 text-fg-secondary">{t("home.intro")}</p>
        </div>

        {!me.email_verified && (
          <Alert tone="info" title={t("home.verifyEmailTitle")}>
            {t("home.verifyEmailBody", { email: me.email })}
          </Alert>
        )}

        <Link to="/" className={buttonClassName({ size: "lg", fullWidth: true })}>
          <MagnifyingGlass aria-hidden="true" className="size-icon" />
          {t("home.findCare")}
        </Link>

        {FEATURE_HOME_CARDS().map((HomeCard, index) => (
          <HomeCard key={index} />
        ))}

        <Card as="section" aria-labelledby="next-visit" className="flex items-start gap-4">
          <CalendarBlank aria-hidden="true" className="size-8 shrink-0 text-brand" />
          <div className="flex flex-col gap-1">
            <h2 id="next-visit" className="m-0 text-h3">
              {t("home.nextVisitTitle")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("home.nextVisitEmpty")}</p>
          </div>
        </Card>

        <Card as="section" aria-labelledby="display-settings" className="flex flex-col gap-3">
          <h2 id="display-settings" className="m-0 text-h3">
            {t("home.settingsTitle")}
          </h2>
          <ThemeToggle />
        </Card>

        <EmergencyNotice />
      </main>
    </div>
  );
}
