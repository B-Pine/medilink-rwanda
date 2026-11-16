import type { StaffMe } from "@medilink/api-client";
import { cx, Logo, NavGroup } from "@medilink/ui";
import { SidebarSimple, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import { BUILT_PATHS } from "../app/features";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { FacilitySwitcher } from "./FacilitySwitcher";
import { useNavCounts } from "./useNavCounts";
import {
  navLabelKey,
  navSection,
  PLATFORM_SECTIONS,
  platformSection,
  visibleNavItems,
  type NavItem,
} from "./navigation";

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
  counts = {},
  onNavigate,
}: {
  items: NavItem[];
  active: string | undefined;
  collapsed: boolean;
  counts?: Record<string, number>;
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
                    : "text-fg-secondary group-hover:text-fg",
                )}
              >
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className="size-[1.0625rem]"
                />
              </span>
              <span className={cx("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}>
                {t(navLabelKey({ key, labelKey }))}
              </span>
              {(counts[key] ?? 0) > 0 && (
                <span
                  className={cx(
                    "ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
                    isActive ? "bg-primary text-on-primary" : "bg-subtle text-fg-secondary",
                    // collapsed: a dot on the icon; the number stays for assistive tech
                    collapsed &&
                      "lg:absolute lg:top-1 lg:right-1.5 lg:size-2 lg:min-w-0 lg:bg-primary lg:p-0 lg:text-[0]",
                  )}
                >
                  <span className="sr-only">, </span>
                  {counts[key]}
                </span>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
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
  const counts = useNavCounts(me);
  const facility = items.filter((item) => item.group === "facility");
  const work = facility.filter((item) => navSection(item) === "work");
  const practice = facility.filter((item) => navSection(item) === "practice");
  const manage = facility.filter((item) => navSection(item) === "manage");
  const help = facility.filter((item) => navSection(item) === "help");
  const platform = items.filter((item) => item.group === "platform");
  const groups = [
    { key: "work", title: t("shell.section.work"), list: work },
    { key: "practice", title: t("shell.section.practice"), list: practice },
    { key: "manage", title: t("shell.section.manage"), list: manage },
    // the MediLink console, split by job so 16 links never read as one long list
    ...PLATFORM_SECTIONS.map((section) => ({
      key: `platform.${section}`,
      title: t(`shell.section.platform.${section}`),
      list: platform.filter((item) => platformSection(item) === section),
    })),
  ].filter((group) => group.list.length > 0);

  return (
    <nav
      id={id}
      aria-label={t("shell.navLabel")}
      className={cx(
        "flex-col gap-1 border-r border-border/70 bg-surface px-3 py-4 print:hidden",
        // phones and tablets: a panel over the page, opened from the top bar
        "fixed inset-y-0 left-0 z-50 w-[min(18rem,86vw)] shadow-e3 animate-enter",
        "lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-dvh lg:w-auto lg:animate-none lg:shadow-none",
        open ? "flex" : "hidden",
      )}
    >
      <div
        className={cx(
          "flex items-center justify-between px-1.5 pb-4",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        {collapsed ? <Logo variant="symbol" className="h-8" /> : <Logo className="h-8" />}
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label={t("shell.closeMenu")}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl text-fg-muted transition-colors duration-150 ease-out-quint hover:bg-subtle hover:text-fg lg:hidden"
          >
            <X aria-hidden="true" className="size-[1.125rem]" />
          </button>
        )}
      </div>

      <div className="mb-2">
        <FacilitySwitcher me={me} collapsed={collapsed} />
      </div>

      <div className="-mx-1.5 flex flex-1 flex-col overflow-y-auto px-1.5 py-1">
        {/* each group can be hidden and shown again; the choice stays on this device */}
        {groups.map(({ key, title, list }) => (
          <NavGroup
            key={key}
            id={`staff.${key}`}
            title={title}
            railed={collapsed}
            railedAt="lg"
            containsActive={list.some((item) => item.path === active)}
          >
            <NavList
              items={list}
              active={active}
              collapsed={collapsed}
              counts={counts}
              onNavigate={onNavigate}
            />
          </NavGroup>
        ))}
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
