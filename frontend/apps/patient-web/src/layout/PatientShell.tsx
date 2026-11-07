import {
  Bell,
  CalendarCheck,
  CaretDown,
  CaretRight,
  CloudSlash,
  DotsThreeOutline,
  FileText,
  Files,
  Gear,
  House,
  IdentificationCard,
  Lifebuoy,
  MagnifyingGlass,
  Pill,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  Ticket,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import {
  CountBadge,
  cx,
  LanguageSwitcher,
  Logo,
  MAIN_CONTENT_ID,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  ProfileSwitcher,
  readPreference,
  SidePanel,
  SkipLink,
  ThemeSwitch,
  writePreference,
} from "@medilink/ui";
import { SUPPORTED_LANGUAGES } from "@medilink/ui/i18n";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";

import { FEATURE_HEADER_ITEMS } from "../app/features";
import { paths } from "../app/paths";
import { useLogout, usePatientMe } from "../auth/queries";
import { GlobalSearch } from "../features/dashboard/GlobalSearch";
import { AssistantLauncher } from "../features/public/AssistantLauncher";
import { Avatar, initials } from "../features/dashboard/kit";
import { useUnreadCount } from "../features/notifications/api";
import {
  rememberProfile,
  useProfiles,
  useRelationshipLabel,
} from "../features/profile/ProfileLayout";
import { InDashboardContext } from "./DashboardContext";
import { ToastProvider } from "./Toasts";

interface NavItem {
  to: string;
  key: string;
  icon: Icon;
  end?: boolean;
  /** Other addresses that belong to this item (for the active state and the breadcrumb). */
  also?: string[];
}

/** Sidebar (upgrade 12 §2A): the eight places of care, then the three account places. */
const MAIN_NAV: NavItem[] = [
  { to: paths.overview, key: "overview", icon: House, end: true },
  {
    to: paths.findCare,
    key: "findCare",
    icon: MagnifyingGlass,
    also: ["/dashboard/facilities", "/dashboard/book"],
  },
  { to: paths.appointments, key: "appointments", icon: CalendarCheck },
  { to: paths.queue, key: "queue", icon: Ticket },
  { to: paths.family, key: "family", icon: UsersThree, also: [paths.profile, paths.claim] },
  { to: paths.records, key: "records", icon: FileText },
  { to: paths.medications, key: "medications", icon: Pill },
  { to: paths.documents, key: "documents", icon: Files },
];
const ACCOUNT_NAV: NavItem[] = [
  { to: paths.notifications, key: "notifications", icon: Bell },
  { to: paths.help, key: "help", icon: Lifebuoy },
  { to: paths.settings, key: "settings", icon: Gear, also: [paths.privacy] },
];

/** Phones (upgrade 12 §2C): four places in the tab bar, the rest under More. */
const TAB_NAV: NavItem[] = [MAIN_NAV[0]!, MAIN_NAV[1]!, MAIN_NAV[2]!, MAIN_NAV[5]!];
const MORE_NAV: NavItem[] = [
  MAIN_NAV[3]!,
  MAIN_NAV[4]!,
  MAIN_NAV[6]!,
  MAIN_NAV[7]!,
  ...ACCOUNT_NAV,
];

const matches = (item: NavItem, pathname: string) =>
  item.end
    ? pathname === item.to
    : [item.to, ...(item.also ?? [])].some(
        (base) => pathname === base || pathname.startsWith(`${base}/`),
      );

const activeItem = (pathname: string) =>
  [...MAIN_NAV, ...ACCOUNT_NAV].find((item) => matches(item, pathname));

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener?.("change", onChange);
      return () => list?.removeEventListener?.("change", onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

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

function useSignOut() {
  const navigate = useNavigate();
  const logout = useLogout();
  return () =>
    logout.mutate(undefined, { onSettled: () => void navigate("/login", { replace: true }) });
}

function NavCount({ collapsed }: { collapsed: boolean }) {
  const count = useUnreadCount();
  const unread = count.data?.unread ?? 0;
  if (!unread) return null;
  return (
    <CountBadge count={unread} className={collapsed ? "absolute top-1 right-1.5" : "ml-auto"} />
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = matches(item, pathname);
  const label = t(`dashboard.nav.${item.key}`);
  const ItemIcon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        // same item as the staff sidebar: emerald pill, accent bar on the edge, filled icon tile
        className={cx(
          "group relative flex min-h-10 items-center gap-3 rounded-xl text-body-sm font-medium no-underline",
          "transition-[background-color,color] duration-200 ease-out-quint",
          collapsed ? "justify-center px-0" : "px-2.5",
          active
            ? "bg-brand-subtle font-semibold text-on-brand-subtle"
            : "text-fg-secondary hover:bg-subtle hover:text-fg",
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 -left-3 w-1 rounded-r-full bg-primary"
          />
        )}
        <span
          className={cx(
            "grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 ease-out-quint",
            active ? "bg-primary text-on-primary shadow-card" : "text-fg-muted group-hover:text-fg",
          )}
        >
          <ItemIcon
            aria-hidden="true"
            weight={active ? "fill" : "regular"}
            className="size-[1.0625rem]"
          />
        </span>
        <span className={cx("truncate", collapsed && "sr-only")}>{label}</span>
        {item.key === "notifications" && <NavCount collapsed={collapsed} />}
      </NavLink>
    </li>
  );
}

/**
 * Account menu in the top bar (as in the staff app): avatar, name and a caret; inside, who is
 * signed in, the account places, the language and log out.
 */
function AccountMenu() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { data: me } = usePatientMe();
  if (!me) return null;
  const items: { to: string; label: string; icon: Icon }[] = [
    { to: paths.profile, label: t("dashboard.account.profile"), icon: IdentificationCard },
    { to: paths.family, label: t("dashboard.account.family"), icon: UsersThree },
    { to: paths.privacy, label: t("dashboard.account.privacy"), icon: ShieldCheck },
    { to: paths.settings, label: t("dashboard.account.settings"), icon: Gear },
  ];
  return (
    <Menu>
      {/* named by its content (WCAG 2.5.3): the visible name first, then "Account menu" */}
      <MenuTrigger className="inline-flex min-h-target cursor-pointer items-center gap-2 rounded-xl px-2 text-fg transition-colors duration-150 hover:bg-subtle data-[state=open]:bg-subtle">
        <span aria-hidden="true" className="contents">
          <Avatar name={me.full_name} size="sm" />
        </span>
        {/* avatar only: the sidebar card already shows whose portal this is */}
        <span className="sr-only">{me.full_name}</span>
        <span className="sr-only">, {t("dashboard.nav.account")}</span>
        <CaretDown aria-hidden="true" className="hidden size-4 text-fg-muted sm:block" />
      </MenuTrigger>
      <MenuContent>
        <div className="px-3 py-2">
          <p className="m-0 font-semibold">{me.full_name}</p>
          <p className="m-0 text-body-sm break-all text-fg-muted">{me.email}</p>
        </div>
        <MenuSeparator />
        {items.map(({ to, label, icon: ItemIcon }) => (
          <MenuItem key={to} onSelect={() => void navigate(to)}>
            <ItemIcon aria-hidden="true" className="size-5 text-fg-muted" />
            {label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLabel>{t("dashboard.nav.language")}</MenuLabel>
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
        <MenuItem onSelect={signOut}>
          <SignOut aria-hidden="true" className="size-5 text-fg-muted" />
          {t("common.logout")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** "Whose care" switcher (upgrade 12 §9): shown once the account cares for someone else too. */
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
    else void navigate(paths.profileOf(id));
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

function Sidebar({
  collapsed,
  overlay,
  onToggle,
}: {
  collapsed: boolean;
  overlay: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { data: me } = usePatientMe();
  const sectionLabel = (key: "care" | "account") => (
    <p
      className={cx(
        "m-0 px-2.5 pt-5 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-muted uppercase",
        collapsed && "sr-only",
      )}
    >
      {t(`dashboard.nav.groups.${key}`)}
    </p>
  );
  // Help sits at the foot, as in the staff app; the other account places stay in the list
  const account = ACCOUNT_NAV.filter((item) => item.key !== "help");
  const help = ACCOUNT_NAV.filter((item) => item.key === "help");
  return (
    <aside
      aria-label={t("dashboard.nav.label")}
      className={cx(
        "fixed inset-y-0 left-0 z-40 flex h-dvh flex-col gap-1 border-r border-border/70 bg-surface px-3 py-4",
        "transition-[width,box-shadow] duration-200 ease-out-quint",
        collapsed ? "w-[4.75rem]" : "w-[15.5rem]",
        overlay && "shadow-raised",
      )}
    >
      <div
        className={cx(
          "flex shrink-0 items-center pb-3",
          collapsed ? "justify-center" : "justify-between px-1.5",
        )}
      >
        <Link
          to={paths.overview}
          className="inline-flex min-h-target items-center rounded-sm no-underline"
        >
          {collapsed ? <Logo variant="symbol" className="h-8" /> : <Logo className="h-8" />}
        </Link>
      </div>

      {/* whose portal this is, like the staff workspace card */}
      {!collapsed && me && (
        <div className="mb-2 flex shrink-0 items-center gap-3 rounded-2xl border border-border/70 bg-page px-3 py-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-heading text-body-sm font-bold text-on-primary"
          >
            {initials(me.full_name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-semibold text-fg">{me.full_name}</span>
            <span className="truncate text-caption text-fg-muted">{t("dashboard.nav.portal")}</span>
          </span>
        </div>
      )}

      {/* only the places scroll on short windows; help and collapse stay pinned */}
      {/* full-bleed (-mx-3) so the active item's accent bar meets the sidebar edge unclipped */}
      <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-1 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
        <nav aria-label={t("dashboard.nav.main")}>
          {sectionLabel("care")}
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {MAIN_NAV.map((item) => (
              <SidebarLink key={item.key} item={item} collapsed={collapsed} />
            ))}
          </ul>
        </nav>
        <nav aria-label={t("dashboard.nav.account")}>
          {sectionLabel("account")}
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {account.map((item) => (
              <SidebarLink key={item.key} item={item} collapsed={collapsed} />
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 pt-3">
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {help.map((item) => (
            <SidebarLink key={item.key} item={item} collapsed={collapsed} />
          ))}
        </ul>
        <div
          className={cx("flex items-center gap-2", collapsed ? "justify-center" : "justify-end")}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("dashboard.nav.expand") : t("dashboard.nav.collapse")}
            title={collapsed ? t("dashboard.nav.expand") : t("dashboard.nav.collapse")}
            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-fg-muted transition-colors duration-150 ease-out-quint hover:bg-subtle hover:text-fg"
          >
            <SidebarSimple aria-hidden="true" className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SearchButton({ onOpen, wide }: { onOpen: () => void; wide: boolean }) {
  const { t } = useTranslation();
  if (!wide)
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("dashboard.search.open")}
        className="inline-flex min-h-target min-w-target cursor-pointer items-center justify-center rounded-full text-fg hover:bg-subtle"
      >
        <MagnifyingGlass aria-hidden="true" className="size-6" />
      </button>
    );
  // the staff command-palette button: page-tinted field, centred in the bar
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-keyshortcuts="Control+K Meta+K"
      className={cx(
        "mx-auto inline-flex min-h-10 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-xl",
        "border border-border/70 bg-page px-3.5 text-left text-body-sm text-fg-muted",
        "transition-[border-color,color,box-shadow] duration-200 ease-out-quint hover:border-fg-muted hover:text-fg hover:shadow-card",
      )}
    >
      <MagnifyingGlass aria-hidden="true" className="size-[1.125rem] shrink-0" />
      {/* the visible text names the button (WCAG 2.5.3) */}
      <span className="flex-1 truncate">{t("dashboard.search.placeholder")}</span>
      <kbd
        aria-hidden="true"
        className="rounded-md border border-border/70 bg-surface px-1.5 py-0.5 font-sans text-caption font-semibold text-fg-muted shadow-card"
      >
        {t("dashboard.search.shortcut")}
      </kbd>
    </button>
  );
}

function Breadcrumb() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const item = activeItem(pathname);
  if (!item) return null;
  const deeper = pathname !== item.to;
  const ItemIcon = item.icon;
  return (
    <nav aria-label={t("dashboard.nav.breadcrumb")} className="min-w-0 shrink-0">
      <ol className="m-0 flex list-none items-center gap-2 p-0 text-body-sm">
        <li className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand"
          >
            <ItemIcon weight="fill" className="size-4" />
          </span>
          {deeper ? (
            <Link
              to={item.to}
              className="truncate font-semibold text-fg-secondary no-underline hover:text-fg"
            >
              {t(`dashboard.nav.${item.key}`)}
            </Link>
          ) : (
            <span aria-current="page" className="truncate font-semibold text-fg">
              {t(`dashboard.nav.${item.key}`)}
            </span>
          )}
        </li>
        {deeper && (
          <>
            <li aria-hidden="true" className="flex text-fg-muted">
              <CaretRight weight="bold" className="size-3" />
            </li>
            <li aria-current="page" className="truncate font-semibold text-fg">
              {t("dashboard.nav.details")}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

function MorePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: me } = usePatientMe();
  const signOut = useSignOut();
  const close = () => onOpenChange(false);
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("dashboard.nav.more")}
      closeLabel={t("dashboard.close")}
    >
      <div className="flex flex-col gap-5">
        {me && (
          <Link
            to={paths.profile}
            onClick={close}
            className="flex items-center gap-3 rounded-2xl border border-border p-3 text-fg no-underline hover:bg-subtle"
          >
            <Avatar name={me.full_name} size="lg" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{me.full_name}</span>
              <span className="truncate text-body-sm text-fg-secondary">
                {t("dashboard.account.viewProfile")}
              </span>
            </span>
          </Link>
        )}
        <HeaderProfileSwitcher />
        <nav aria-label={t("dashboard.nav.more")}>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {MORE_NAV.map((item) => {
              const active = matches(item, pathname);
              const ItemIcon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-target items-center gap-3 rounded-xl px-3 font-semibold no-underline",
                      active ? "bg-brand-subtle text-on-brand-subtle" : "text-fg hover:bg-subtle",
                    )}
                  >
                    <ItemIcon
                      aria-hidden="true"
                      weight={active ? "fill" : "regular"}
                      className={cx("size-6", active ? "text-brand" : "text-fg-secondary")}
                    />
                    <span className="flex-1">{t(`dashboard.nav.${item.key}`)}</span>
                    {item.key === "notifications" && <NavCount collapsed={false} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="font-semibold">{t("dashboard.nav.language")}</span>
          <LanguageSwitcher pill />
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex min-h-target cursor-pointer items-center gap-3 rounded-xl px-3 font-semibold text-fg hover:bg-subtle"
        >
          <SignOut aria-hidden="true" className="size-6 text-fg-secondary" />
          {t("common.logout")}
        </button>
      </div>
    </SidePanel>
  );
}

/**
 * Phone tab bar, rendered outside the sticky header (the header's backdrop blur would otherwise
 * pin a "fixed" bar to the header itself). The page keeps bottom padding so nothing hides under it.
 */
function TabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const inMore = MORE_NAV.some((item) => matches(item, pathname));
  const tab = (active: boolean, ItemIcon: Icon, label: string) => (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200",
          active ? "bg-brand-subtle text-brand" : "text-fg-muted",
        )}
      >
        <ItemIcon weight={active ? "fill" : "regular"} className="size-6" />
      </span>
      <span
        className={cx("text-caption", active ? "font-bold text-fg" : "font-semibold text-fg-muted")}
      >
        {label}
      </span>
    </>
  );
  return (
    <nav
      aria-label={t("dashboard.nav.main")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="m-0 grid list-none grid-cols-5 p-0">
        {TAB_NAV.map((item) => {
          const active = matches(item, pathname);
          return (
            <li key={item.key}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 no-underline"
              >
                {tab(active, item.icon, t(`dashboard.nav.short.${item.key}`))}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className="flex min-h-16 w-full cursor-pointer flex-col items-center justify-center gap-0.5"
          >
            {tab(inMore || moreOpen, DotsThreeOutline, t("dashboard.nav.more"))}
          </button>
        </li>
      </ul>
    </nav>
  );
}

const MD = "(min-width: 48rem)";
const LG = "(min-width: 64rem)";

/**
 * Public discovery pages reused inside the shell link to their public addresses. Inside the
 * dashboard those links open the in-shell copies, so the patient never drops out of the app.
 */
function inShellHref(href: string | null): string | null {
  if (!href) return null;
  if (href === "/facilities" || href.startsWith("/facilities/") || href.startsWith("/facilities?"))
    return `/dashboard${href}`;
  if (href === "/find-care" || href.startsWith("/find-care?"))
    return paths.findCare + href.slice("/find-care".length);
  return null;
}

/**
 * Shell of every signed-in patient page (upgrade 12 §2): a fixed sidebar from laptop width (an
 * icon rail on tablets that opens over the page), a top bar with breadcrumb, search, theme, alerts
 * and the account menu (which holds the language), laid out like the staff app; on phones a compact header, a five-tab bar and a More drawer; an offline
 * banner (design 07 §4).
 */
export function PatientShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const online = useOnline();
  const md = useMedia(MD);
  const lg = useMedia(LG);
  const [userCollapsed, setUserCollapsed] = useState(
    () => readPreference("sidebarCollapsed") === "1",
  );
  const [tabletOpen, setTabletOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const collapsed = lg ? userCollapsed : !tabletOpen;

  // the signed-in app uses the calmer type scale (tokens.css, data-surface="app")
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = "app";
    return () => {
      delete root.dataset.surface;
    };
  }, []);
  const overlay = md && !lg && tabletOpen;

  // A new page closes the tablet overlay and the More drawer
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setTabletOpen(false);
    setMoreOpen(false);
  }

  // Ctrl/Cmd+K anywhere, or "/" outside a field, opens search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    if (!lg) {
      setTabletOpen((open) => !open);
      return;
    }
    writePreference("sidebarCollapsed", userCollapsed ? "0" : "1");
    setUserCollapsed(!userCollapsed);
  };

  return (
    <InDashboardContext.Provider value={true}>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col bg-page text-body">
          <SkipLink />
          {md && <Sidebar collapsed={collapsed} overlay={overlay} onToggle={toggle} />}
          {overlay && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("dashboard.nav.collapse")}
              onClick={() => setTabletOpen(false)}
              className="fixed inset-0 z-30 cursor-default bg-fg/20 animate-fade"
            />
          )}

          <div
            className={cx(
              "flex min-h-dvh flex-1 flex-col transition-[padding] duration-200 ease-out",
              md && (lg && !collapsed ? "pl-[15.5rem]" : "pl-[4.75rem]"),
            )}
          >
            {/* the staff top bar: context left, search centred, theme · alerts | account right */}
            <header className="sticky top-0 z-20 border-b border-border/70 bg-surface">
              <div className="flex min-h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
                {md ? (
                  <Breadcrumb />
                ) : (
                  <Link
                    to={paths.overview}
                    className="inline-flex min-h-target items-center rounded-sm no-underline"
                  >
                    <Logo className="h-8" />
                  </Link>
                )}
                {lg ? (
                  <SearchButton onOpen={() => setSearchOpen(true)} wide />
                ) : (
                  <span className="ml-auto" />
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  {md && <HeaderProfileSwitcher />}
                  {!lg && <SearchButton onOpen={() => setSearchOpen(true)} wide={false} />}
                  <ThemeSwitch tone="ghost" />
                  {FEATURE_HEADER_ITEMS().map((Item, index) => (
                    <Item key={index} />
                  ))}
                  <span aria-hidden="true" className="mx-1.5 hidden h-7 w-px bg-border sm:block" />
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
              onClickCapture={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const anchor = (event.target as HTMLElement).closest("a");
                if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
                const to = inShellHref(anchor.getAttribute("href"));
                if (!to) return;
                event.preventDefault();
                event.stopPropagation();
                void navigate(to);
              }}
              className="mx-auto flex w-full max-w-[80rem] flex-1 flex-col px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-16 lg:px-8"
            >
              <div key={pathname} className="flex flex-1 flex-col animate-enter">
                <Outlet />
              </div>
              {/* inside <main> so links from the answer open the in-shell pages */}
              <AssistantLauncher raised={!md} compact />
            </main>
          </div>

          {!md && <TabBar onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />}
          {!md && <MorePanel open={moreOpen} onOpenChange={setMoreOpen} />}
          {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
        </div>
      </ToastProvider>
    </InDashboardContext.Provider>
  );
}
