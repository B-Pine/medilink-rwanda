import {
  CaretDown,
  IdentificationBadge,
  LockKey,
  ShieldCheck,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { hasPermission, type StaffMe } from "@medilink/api-client";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@medilink/ui";
import { SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useApi, useServices } from "../app/services";
import { useAuthFlow } from "../auth/auth-flow";
import { useLogout } from "../auth/queries";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Avatar menu: who is signed in, theme, language, log out (design 04 §2). */
export function UserMenu({ me }: { me: StaffMe }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const { setPending } = useAuthFlow();
  const api = useApi();
  const { lock } = useServices();

  const onLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        setPending(null);
        void navigate("/login", { replace: true });
      },
    });
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={`${t("shell.userMenu.label")}: ${me.full_name}`}
        className="inline-flex min-h-target cursor-pointer items-center gap-2 rounded-xl px-2 text-fg hover:bg-subtle"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-brand-subtle text-body-sm font-bold text-on-brand-subtle"
        >
          {initials(me.full_name)}
        </span>
        <span className="hidden max-w-48 truncate font-semibold sm:inline">{me.full_name}</span>
        <CaretDown aria-hidden="true" className="size-4 text-fg-muted" />
      </MenuTrigger>
      <MenuContent>
        <div className="px-3 py-2">
          <p className="m-0 text-body-sm text-fg-muted">{t("shell.userMenu.signedInAs")}</p>
          <p className="m-0 font-semibold">{me.full_name}</p>
          <p className="m-0 text-body-sm break-all text-fg-muted">{me.email}</p>
        </div>
        <MenuSeparator />
        <MenuLabel>{t("shell.userMenu.language")}</MenuLabel>
        <MenuRadioGroup
          value={i18n.resolvedLanguage ?? i18n.language}
          onValueChange={(language) => void i18n.changeLanguage(language)}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <MenuRadioItem key={language} value={language} lang={language}>
              {t(`language.names.${language}`, { ns: "ui" })}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={() => void navigate("/account")}>
          <UserCircle aria-hidden="true" className="size-icon" />
          {t("setup.account.menu")}
        </MenuItem>
        {hasPermission(me, "clinical.write") && (
          <MenuItem onSelect={() => void navigate("/profile/clinician")}>
            <IdentificationBadge aria-hidden="true" className="size-icon" />
            {t("clinical.nav.profile")}
          </MenuItem>
        )}
        <MenuItem onSelect={() => void navigate("/account/security")}>
          <ShieldCheck aria-hidden="true" className="size-icon" />
          {t("lock.menuSecurity")}
        </MenuItem>
        <MenuItem
          onSelect={() => {
            lock.setLocked(true);
            void api.security.lock().catch(() => undefined);
          }}
        >
          <LockKey aria-hidden="true" className="size-icon" />
          {t("lock.menuLock")}
        </MenuItem>
        <MenuItem onSelect={onLogout} disabled={logout.isPending}>
          <SignOut aria-hidden="true" className="size-icon" />
          {logout.isPending ? t("shell.userMenu.loggingOut") : t("shell.userMenu.logout")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
