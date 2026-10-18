import type { StaffMe } from "@medilink/api-client";
import { cx, Logo } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { ConnectionIndicator } from "./ConnectionIndicator";
import { navLabelKey, visibleNavItems, type NavItem } from "./navigation";

function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map(({ key, path, icon: ItemIcon, labelKey }) => (
        <li key={key}>
          <NavLink
            to={path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex min-h-target items-center gap-3 rounded-md px-3 font-semibold no-underline",
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
                <span>{t(navLabelKey({ key, labelKey }))}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Sidebar grouped by role; only what the user can use is shown (design 04 §2). */
export function Sidebar({
  me,
  id,
  open,
  onNavigate,
}: {
  me: StaffMe;
  id: string;
  open: boolean;
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
      <div className="hidden px-2 pt-1 pb-2 lg:block">
        <Logo className="h-9" />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        <NavList items={facilityItems} onNavigate={onNavigate} />
        {platformItems.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="m-0 px-3 text-caption font-semibold tracking-wide text-fg-muted uppercase">
              {t("shell.platformAdmin")}
            </p>
            <NavList items={platformItems} onNavigate={onNavigate} />
          </div>
        )}
      </div>
      <ConnectionIndicator className="self-start" />
    </nav>
  );
}
