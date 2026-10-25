import { List, MagnifyingGlass, X } from "@phosphor-icons/react";
import { cx, Logo, MAIN_CONTENT_ID, readPreference, SkipLink, writePreference } from "@medilink/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { useStaffMe } from "../auth/queries";
import { FEATURE_HEADER_ITEMS, FEATURE_SHELL_OVERLAYS } from "../app/features";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { FacilitySwitcher } from "./FacilitySwitcher";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

const SIDEBAR_ID = "app-sidebar";

/** Collapsed sidebar: a per-device UI preference (best-effort storage). */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readPreference("sidebarCollapsed") === "1");
  const toggle = () => {
    writePreference("sidebarCollapsed", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };
  return [collapsed, toggle];
}

/**
 * Staff app shell (design 04 §2): sidebar (by role, collapsible to icons) + top bar (facility
 * switcher, command palette, user menu) + content. On small screens the sidebar is a disclosure
 * opened from the top bar.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { data: me } = useStaffMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(useCallback(() => setPaletteOpen((open) => !open), []));

  if (!me) return null; // RequireStaff guarantees the user; this only narrows the type.

  return (
    <div
      className={cx(
        "min-h-dvh bg-page lg:grid",
        collapsed ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[15.5rem_minmax(0,1fr)]",
      )}
    >
      <SkipLink />
      <div className="lg:contents">
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 print:hidden lg:hidden">
          <Logo className="h-8" />
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={SIDEBAR_ID}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-h-target min-w-target cursor-pointer items-center justify-center gap-2 rounded-md px-3 font-semibold text-fg hover:bg-subtle"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-icon" />
            ) : (
              <List aria-hidden="true" className="size-icon" />
            )}
            <span>{menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}</span>
          </button>
        </div>
        <Sidebar
          me={me}
          id={SIDEBAR_ID}
          open={menuOpen}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onNavigate={() => setMenuOpen(false)}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-surface px-4 print:hidden lg:px-8">
          <FacilitySwitcher me={me} />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("shell.palette.open")}
            aria-keyshortcuts="Control+K Meta+K"
            className={cx(
              "ml-auto inline-flex min-h-target min-w-target cursor-pointer items-center justify-center gap-2 rounded-md",
              "border border-border-input bg-page px-3 text-fg-muted hover:text-fg",
              "md:w-72 md:justify-start",
            )}
          >
            <MagnifyingGlass aria-hidden="true" className="size-icon shrink-0" />
            <span className="hidden flex-1 text-left md:inline">{t("shell.palette.open")}</span>
            <kbd className="hidden rounded-sm border border-border bg-surface px-1.5 font-sans text-caption text-fg-muted md:inline">
              {t("shell.palette.shortcut")}
            </kbd>
          </button>
          <div className="flex items-center gap-2">
            {FEATURE_HEADER_ITEMS().map((Item, index) => (
              <Item key={index} />
            ))}
            <UserMenu me={me} />
          </div>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-[90rem] flex-1 p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette me={me} open={paletteOpen} onOpenChange={setPaletteOpen} />
      {FEATURE_SHELL_OVERLAYS().map((Overlay, index) => (
        <Overlay key={index} />
      ))}
    </div>
  );
}
