import type { StaffMe } from "@medilink/api-client";
import { cx, Logo } from "@medilink/ui";
import { SidebarSimple } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { ConnectionIndicator } from "./ConnectionIndicator";
import { navLabelKey, visibleNavItems, type NavItem } from "./navigation";

function NavList({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map(({ key, path, icon: ItemIcon, labelKey }) => (
        <li key={key}>
          <NavLink
            to={path}
            end={path === "/platform"}
            onClick={onNavigate}
            title={collapsed ? t(navLabelKey({ key, labelKey })) : undefined}
            className={({ isActive }) =>
              cx(
                "flex min-h-target items-center gap-3 rounded-md px-3 font-semibold no-underline",
                collapsed && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-brand-subtle text-on-brand-subtle"
                  : "text-fg-secondary hover:bg-subtle hover:text-fg",
              )
            }
          >
            {({ isActive }) => (
              <>
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className="size-icon shrink-0"
                />
                <span className={cx(collapsed && "lg:sr-only")}>
                  {t(navLabelKey({ key, labelKey }))}
                </span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Sidebar grouped by role; only what the user can use is shown (design 04 §2). On large screens
 * it collapses to icons (labels stay for assistive technology and as tooltips).
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
  const items = visibleNavItems(me);
  const facilityItems = items.filter((item) => item.group === "facility");
  const platformItems = items.filter((item) => item.group === "platform");

  return (
    <nav
      id={id}
      aria-label={t("shell.navLabel")}
      className={cx(
        "flex-col gap-4 border-border bg-surface p-3 print:hidden",
        "lg:sticky lg:top-0 lg:flex lg:h-dvh lg:border-r",
        open ? "flex border-b" : "hidden",
      )}
    >
      <div className={cx("hidden pt-1 pb-2 lg:block", collapsed ? "self-center" : "px-2")}>
        {collapsed ? <Logo variant="symbol" className="h-9" /> : <Logo className="h-9" />}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        <NavList items={facilityItems} collapsed={collapsed} onNavigate={onNavigate} />
        {platformItems.length > 0 && (
          <div
            className={cx(
              "flex flex-col gap-1",
              collapsed && "lg:border-t lg:border-border lg:pt-3",
            )}
          >
            <p
              className={cx(
                "m-0 px-3 text-caption font-semibold tracking-wide text-fg-muted uppercase",
                collapsed && "lg:sr-only",
              )}
            >
              {t("shell.platformAdmin")}
            </p>
            <NavList items={platformItems} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        )}
      </div>
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
          className="hidden min-h-target min-w-target cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg lg:inline-flex"
        >
          <SidebarSimple aria-hidden="true" className="size-icon" />
        </button>
      </div>
    </nav>
  );
}
