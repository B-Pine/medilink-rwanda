import type { StaffMe } from "@medilink/api-client";
import { cx, Logo } from "@medilink/ui";
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
                "flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-body-sm font-medium no-underline",
                "transition-[background-color,color,box-shadow] duration-150",
                collapsed && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-surface font-semibold text-fg shadow-card"
                  : "text-fg-secondary hover:bg-subtle hover:text-fg",
              )}
            >
              <>
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className={cx("size-[1.125rem] shrink-0", isActive && "text-brand")}
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
        "m-0 px-2.5 pt-3 pb-1 text-caption font-semibold tracking-wide text-fg-muted uppercase",
        collapsed && "lg:sr-only",
      )}
    >
      {children}
    </p>
  );
}

/**
 * Sidebar (design 04 §2): on the page colour with a hairline edge, so navigation serves the
 * content instead of competing with it. Daily work first, running the facility second, the
 * MediLink platform last, help pinned at the foot. Only permitted, built sections appear.
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
        "flex-col gap-2 border-r border-border bg-page px-3 py-4 print:hidden",
        "lg:sticky lg:top-0 lg:flex lg:h-dvh",
        open ? "flex" : "hidden",
      )}
    >
      <div className={cx("hidden pb-3 lg:block", collapsed ? "self-center" : "px-2")}>
        {collapsed ? <Logo variant="symbol" className="h-8" /> : <Logo className="h-8" />}
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
      <div className="-mx-1.5 flex flex-col gap-2 border-t border-border px-1.5 pt-3">
        {help.length > 0 && (
          <NavList items={help} active={active} collapsed={collapsed} onNavigate={onNavigate} />
        )}
        <div
          className={cx(
            "flex items-center justify-between gap-2",
            collapsed && "lg:flex-col lg:items-center",
          )}
        >
          <ConnectionIndicator compact={collapsed} />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
            title={collapsed ? t("shell.expand") : t("shell.collapse")}
            className="hidden min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg lg:inline-flex"
          >
            <SidebarSimple aria-hidden="true" className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </nav>
  );
}
