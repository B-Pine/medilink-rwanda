import type { StaffMe } from "@medilink/api-client";
import { cx, ImigongoPattern, Logo } from "@medilink/ui";
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
                "relative flex min-h-target items-center gap-3 rounded-md px-3 font-medium no-underline",
                "transition-colors duration-150 focus-visible:outline-on-forest-accent",
                collapsed && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-forest-raised text-on-forest before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-on-forest-accent"
                  : "text-on-forest-muted hover:bg-forest-raised/60 hover:text-on-forest",
              )
            }
          >
            {({ isActive }) => (
              <>
                <ItemIcon
                  aria-hidden="true"
                  weight={isActive ? "fill" : "regular"}
                  className={cx("size-icon shrink-0", isActive && "text-on-forest-accent")}
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
        "relative isolate flex-col gap-4 overflow-hidden bg-forest p-3 text-on-forest print:hidden",
        "lg:sticky lg:top-0 lg:flex lg:h-dvh",
        open ? "flex" : "hidden",
      )}
    >
      {/* Imigongo band fading up from the foot of the sidebar (design 01 §4) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 text-on-forest-accent"
        style={{ maskImage: "linear-gradient(to top, black, transparent)" }}
      >
        <ImigongoPattern opacity={0.09} />
      </div>
      <div className={cx("hidden pt-1 pb-3 lg:block", collapsed ? "self-center" : "px-2")}>
        {collapsed ? (
          <Logo variant="symbol" tone="onDark" className="h-9" />
        ) : (
          <Logo tone="onDark" className="h-9" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        <NavList items={facilityItems} collapsed={collapsed} onNavigate={onNavigate} />
        {platformItems.length > 0 && (
          <div
            className={cx(
              "flex flex-col gap-1",
              collapsed && "lg:border-t lg:border-forest-raised lg:pt-3",
            )}
          >
            <p
              className={cx(
                "m-0 px-3 pb-1 text-body-sm font-semibold text-on-forest",
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
          className="hidden min-h-target min-w-target cursor-pointer items-center justify-center rounded-md text-on-forest-muted hover:bg-forest-raised hover:text-on-forest focus-visible:outline-on-forest-accent lg:inline-flex"
        >
          <SidebarSimple aria-hidden="true" className="size-icon" />
        </button>
      </div>
    </nav>
  );
}
