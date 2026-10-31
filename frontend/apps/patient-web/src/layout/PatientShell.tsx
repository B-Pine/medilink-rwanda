import {
  CalendarCheck,
  CloudSlash,
  Gear,
  House,
  IdentificationCard,
  Lifebuoy,
  MagnifyingGlass,
  ShieldCheck,
  SignOut,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import {
  cx,
  LanguageSwitcher,
  Logo,
  MAIN_CONTENT_ID,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  ProfileSwitcher,
  SkipLink,
} from "@medilink/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";

import { FEATURE_HEADER_ITEMS } from "../app/features";
import { useLogout, usePatientMe } from "../auth/queries";
import {
  rememberProfile,
  useProfiles,
  useRelationshipLabel,
} from "../features/profile/ProfileLayout";

/** The four destinations of the patient app (design 07 §2): bottom bar on phones, top bar above. */
const NAV: { to: string; key: string; icon: Icon; end?: boolean }[] = [
  { to: "/home", key: "home", icon: House, end: true },
  { to: "/find-care", key: "findCare", icon: MagnifyingGlass },
  { to: "/visits", key: "visits", icon: CalendarCheck },
  { to: "/support", key: "help", icon: Lifebuoy },
];

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = usePatientMe();
  const logout = useLogout();
  if (!me) return null;
  const go = (to: string) => () => void navigate(to);
  const items: { to: string; label: string; icon: Icon }[] = [
    { to: "/profile", label: t("shell.account.profile"), icon: IdentificationCard },
    { to: "/family", label: t("shell.account.family"), icon: UsersThree },
    { to: "/privacy/settings", label: t("shell.account.privacy"), icon: ShieldCheck },
    { to: "/settings", label: t("shell.account.settings"), icon: Gear },
  ];
  return (
    <Menu>
      <MenuTrigger
        aria-label={t("shell.account.label", { name: me.full_name })}
        className="inline-flex min-h-target items-center gap-2 rounded-full p-1 text-fg hover:bg-subtle sm:pr-3"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-full bg-brand-subtle font-heading font-bold text-on-brand-subtle"
        >
          {initials(me.full_name)}
        </span>
        <span aria-hidden="true" className="hidden max-w-[9rem] truncate font-semibold lg:inline">
          {me.full_name}
        </span>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("shell.account.signedIn", { name: me.full_name })}</MenuLabel>
        {items.map(({ to, label, icon: ItemIcon }) => (
          <MenuItem key={to} onSelect={go(to)}>
            <ItemIcon aria-hidden="true" className="size-icon text-fg-muted" />
            {label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          onSelect={() =>
            logout.mutate(undefined, {
              onSettled: () => void navigate("/login", { replace: true }),
            })
          }
        >
          <SignOut aria-hidden="true" className="size-icon text-fg-muted" />
          {t("common.logout")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** "Me ▾" (design 07 §2): shown once the account cares for someone else too. */
function HeaderProfileSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId } = useParams();
  const profiles = useProfiles();
  const label = useRelationshipLabel();
  const list = profiles.data?.results ?? [];
  if (list.length < 2) return null;
  const switchTo = (id: string) => {
    rememberProfile(id);
    if (patientId) void navigate(location.pathname.replace(patientId, id));
    else void navigate(`/profile/${id}`);
  };
  return (
    <ProfileSwitcher
      label={t("profile.switch")}
      currentId={patientId ?? null}
      onSelect={switchTo}
      profiles={list.map((p) => ({
        id: p.patient_id,
        name: p.display_name,
        relationship: label(p.relationship),
      }))}
    />
  );
}

/**
 * Shell of every logged-in patient page (design 07 §2): header with the profile switcher,
 * notifications, language and account; the four destinations as a bottom bar on phones and a top
 * bar from tablet width; an offline banner (design 07 §4).
 */
export function PatientShell() {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <div className="flex min-h-dvh flex-col bg-page text-body">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center md:flex-nowrap gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
          <Link
            to="/home"
            className="inline-flex min-h-target items-center rounded-sm no-underline"
          >
            <Logo className="h-10" />
          </Link>
          <nav
            aria-label={t("shell.nav")}
            className={cx(
              // Phones: fixed bottom bar, 64 px targets, clear of the home indicator
              "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]",
              // Tablet and up: inline in the header
              "md:static md:ml-2 md:shrink-0 md:border-0 md:bg-transparent md:pb-0",
            )}
          >
            <ul className="m-0 grid list-none grid-cols-4 p-0 md:flex md:gap-1">
              {NAV.map(({ to, key, icon: NavIcon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cx(
                        "relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 text-caption font-semibold no-underline",
                        "md:min-h-target md:flex-row md:gap-2 md:whitespace-nowrap md:rounded-md md:px-3 md:text-body",
                        isActive
                          ? "text-brand md:bg-brand-subtle md:text-on-brand-subtle"
                          : "text-fg-muted hover:text-fg md:hover:bg-subtle",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={cx(
                            "absolute inset-x-6 top-0 h-1 rounded-b-full md:hidden",
                            isActive ? "bg-brand" : "bg-transparent",
                          )}
                        />
                        <NavIcon
                          aria-hidden="true"
                          weight={isActive ? "fill" : "regular"}
                          className="size-6 md:size-5"
                        />
                        {t(`shell.items.${key}`)}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex min-w-0 flex-wrap items-center md:flex-nowrap justify-end gap-2">
            <HeaderProfileSwitcher />
            {FEATURE_HEADER_ITEMS().map((Item, index) => (
              <Item key={index} />
            ))}
            <LanguageSwitcher compact />
            <AccountMenu />
          </div>
        </div>
        {!online && (
          <p
            role="status"
            className="m-0 flex items-center justify-center gap-2 bg-warning-bg px-4 py-2 text-body-sm font-semibold text-fg"
          >
            <CloudSlash aria-hidden="true" className="size-5 shrink-0" />
            {t("shell.offline")}
          </p>
        )}
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[72rem] flex-1 flex-col px-4 pt-6 pb-28 sm:px-6 md:pb-12"
      >
        <Outlet />
      </main>
    </div>
  );
}
