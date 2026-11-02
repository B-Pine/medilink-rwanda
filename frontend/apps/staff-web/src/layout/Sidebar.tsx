import type { StaffMe } from "@medilink/api-client";
import { cx, ImigongoPattern, Logo } from "@medilink/ui";
import { SidebarSimple } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import { BUILT_PATHS } from "../app/features";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { navLabelKey, navSection, visibleNavItems, type NavItem } from "./navigation";

/**
 * The one menu item for the current address: the longest path that matches it, so /queue/mine
 * keeps Queue lit while /queue/reorders (its own item) lights only itself.
 */
function activePath(items: NavItem[], pathname: string): string | undefined {
  return items
    .map((item) => item.path)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
}

function NavList({
  items,
  active,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  active: string | undefined;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map(({ key, path, icon: ItemIcon, labelKey }) => {
        const isActive = path === active;
        return (
          <li key={key}>
            <NavLink
              to={path}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? t(navLabelKey({ key, labelKey })) : undefined}
              className={cx(
                "relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-body-sm font-medium no-underline",
                "transition-[background-color,color] duration-200 ease-out-quint",
                collapsed && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-on-forest/12 font-semibold text-on-forest before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-on-forest-accent"
                  : "text-on-forest-muted hover:bg-on-forest/8 hover:text-on-forest",
              )}
            >
              <>
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className={cx("size-[1.125rem] shrink-0", isActive && "text-on-forest-accent")}
                />
                <span className={cx("truncate", collapsed && "lg:sr-only")}>
                  {t(navLabelKey({ key, labelKey }))}
                </span>
              </>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  return (
    <p
      className={cx(
        "m-0 px-3 pt-4 pb-1.5 text-caption font-semibold tracking-wider text-on-forest-muted/70 uppercase",
        collapsed && "lg:sr-only",
      )}
    >
      {children}
    </p>
  );
}

/**
 * Sidebar (design 04 §2, staff redesign 2026-11-02): a deep-forest panel in the brand colour, so
 * the workspace reads as MediLink at a glance and the white content area stays calm. Daily work
 * first, running the facility second, the MediLink platform last, help pinned at the foot. Only
 * permitted, built sections appear.
 */
export function Sidebar({
  me,
  id,
  open,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  me: StaffMe;
  id: string;
  open: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const items = visibleNavItems(me, BUILT_PATHS());
  const active = activePath(items, pathname);
  const facility = items.filter((item) => item.group === "facility");
  const work = facility.filter((item) => navSection(item) === "work");
  const manage = facility.filter((item) => navSection(item) === "manage");
  const help = facility.filter((item) => navSection(item) === "help");
  const platform = items.filter((item) => item.group === "platform");

  return (
    <nav
      id={id}
      aria-label={t("shell.navLabel")}
      className={cx(
        "relative isolate flex-col gap-2 overflow-hidden bg-forest px-3 py-5 text-on-forest print:hidden",
        "lg:sticky lg:top-0 lg:flex lg:h-dvh",
        open ? "flex" : "hidden",
      )}
    >
      <ImigongoPattern opacity={0.05} className="-z-10 text-on-forest-accent" />
      <div className={cx("hidden pb-4 lg:block", collapsed ? "self-center" : "px-2")}>
        {collapsed ? (
          <Logo variant="symbol" tone="onDark" className="h-8" />
        ) : (
          <Logo tone="onDark" className="h-8" />
        )}
      </div>
      <div className="-mx-1.5 flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 py-1">
        {work.length > 0 && (
          <NavList items={work} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        )}
        {manage.length > 0 && (
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>{t("shell.section.manage")}</SectionLabel>
            <NavList items={manage} active={active} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        )}
        {platform.length > 0 && (
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>{t("shell.platformAdmin")}</SectionLabel>
            <NavList
              items={platform}
              active={active}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </div>
        )}
      </div>
      <div className="-mx-1.5 flex flex-col gap-2 border-t border-on-forest/15 px-1.5 pt-3">
        {help.length > 0 && (
          <NavList items={help} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        )}
        <div
          className={cx(
            "flex items-center justify-between gap-2",
            collapsed && "lg:flex-col lg:items-center",
          )}
        >
          <ConnectionIndicator compact={collapsed} onDark />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
            title={collapsed ? t("shell.expand") : t("shell.collapse")}
            className="hidden min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg text-on-forest-muted transition-colors duration-150 ease-out-quint hover:bg-on-forest/10 hover:text-on-forest lg:inline-flex"
          >
            <SidebarSimple aria-hidden="true" className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </nav>
  );
}
