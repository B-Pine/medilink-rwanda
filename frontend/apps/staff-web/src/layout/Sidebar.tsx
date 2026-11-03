import type { StaffMe } from "@medilink/api-client";
import { cx, Logo } from "@medilink/ui";
import { SidebarSimple } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import { BUILT_PATHS } from "../app/features";
import { roleLabel } from "../facility/labels";
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
                "group relative flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-body-sm font-medium no-underline",
                "transition-[background-color,color] duration-200 ease-out-quint",
                collapsed && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-brand-subtle font-semibold text-on-brand-subtle"
                  : "text-fg-secondary hover:bg-subtle hover:text-fg",
              )}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 -left-3 w-1 rounded-r-full bg-primary"
                />
              )}
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 ease-out-quint",
                  isActive
                    ? "bg-primary text-on-primary shadow-card"
                    : "text-fg-muted group-hover:text-fg",
                )}
              >
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className="size-[1.0625rem]"
                />
              </span>
              <span className={cx("truncate", collapsed && "lg:sr-only")}>
                {t(navLabelKey({ key, labelKey }))}
              </span>
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
        "m-0 px-2.5 pt-5 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-muted uppercase",
        collapsed && "lg:sr-only",
      )}
    >
      {children}
    </p>
  );
}

/**
 * Sidebar (design 04 §2, staff redesign 2026-11-02): a white panel in the light theme and the dark
 * surface in the dark theme (tokens only). The logo and the person's workspace on top; daily work
 * first, running the facility second, the MediLink platform last; help, connection and collapse
 * pinned at the foot. The current page is an emerald pill with an accent bar and a filled icon
 * tile. Only permitted, built sections appear.
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
  const practice = facility.filter((item) => navSection(item) === "practice");
  const manage = facility.filter((item) => navSection(item) === "manage");
  const help = facility.filter((item) => navSection(item) === "help");
  const platform = items.filter((item) => item.group === "platform");
  const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);

  return (
    <nav
      id={id}
      aria-label={t("shell.navLabel")}
      className={cx(
        "flex-col gap-1 border-r border-border/70 bg-surface px-3 py-4 print:hidden",
        "lg:sticky lg:top-0 lg:flex lg:h-dvh",
        open ? "flex" : "hidden",
      )}
    >
      <div
        className={cx(
          "hidden items-center pb-3 lg:flex",
          collapsed ? "justify-center" : "justify-between px-1.5",
        )}
      >
        {collapsed ? <Logo variant="symbol" className="h-8" /> : <Logo className="h-8" />}
      </div>

      {!collapsed && (
        <div className="mb-2 hidden items-center gap-3 rounded-2xl border border-border/70 bg-page px-3 py-2.5 lg:flex">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-heading text-body-sm font-bold text-on-primary">
            {(membership?.facility.name ?? "MediLink").slice(0, 2).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-semibold text-fg">
              {membership?.facility.name ?? t("shell.platformAdmin")}
            </span>
            <span className="truncate text-caption text-fg-muted">
              {membership
                ? membership.roles.map((role) => roleLabel(role, t)).join(" · ")
                : t("today.platform")}
            </span>
          </span>
        </div>
      )}

      <div className="-mx-1.5 flex flex-1 flex-col overflow-y-auto px-1.5 py-1">
        {work.length > 0 && (
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>{t("shell.section.work")}</SectionLabel>
            <NavList items={work} active={active} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        )}
        {practice.length > 0 && (
          <div className="flex flex-col">
            <SectionLabel collapsed={collapsed}>{t("shell.section.practice")}</SectionLabel>
            <NavList
              items={practice}
              active={active}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </div>
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

      <div className="-mx-1.5 flex flex-col gap-2 border-t border-border/70 px-1.5 pt-3">
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
            className="hidden min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-fg-muted transition-colors duration-150 ease-out-quint hover:bg-subtle hover:text-fg lg:inline-flex"
          >
            <SidebarSimple aria-hidden="true" className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </nav>
  );
}
