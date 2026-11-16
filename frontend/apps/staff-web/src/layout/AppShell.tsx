import { List, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  cx,
  Logo,
  MAIN_CONTENT_ID,
  readPreference,
  SkipLink,
  ThemeSwitch,
  writePreference,
} from "@medilink/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { useStaffMe } from "../auth/queries";
import { FEATURE_HEADER_ITEMS, FEATURE_SHELL_OVERLAYS } from "../app/features";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
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
  // the phone menu closes with Escape, like any panel over the page
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!me) return null; // RequireStaff guarantees the user; this only narrows the type.

  return (
    <div
      className={cx(
        "ml-soft min-h-dvh bg-page lg:grid",
        // Sidebar 248 px, collapsed to icons at 64 px (design 03 §4; tokens sidebar / sidebar-collapsed)
        collapsed
          ? "lg:grid-cols-[var(--spacing-sidebar-collapsed)_minmax(0,1fr)]"
          : "lg:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)]",
      )}
    >
      <SkipLink />
      <div className="lg:contents">
        {menuOpen && (
          <div
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-fg/30 animate-fade lg:hidden"
          />
        )}
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
        {/* one bar on every screen: menu and logo on phones; search; then alerts, theme, account */}
        <header className="ml-site-header sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border/70 bg-surface px-3 print:hidden sm:gap-4 sm:px-4 lg:px-8">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={SIDEBAR_ID}
            aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg transition-colors duration-150 ease-out-quint hover:bg-subtle lg:hidden"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-icon" />
            ) : (
              <List aria-hidden="true" className="size-icon" />
            )}
          </button>
          {/* the Logo picks its own light/dark image, so the breakpoints sit on wrappers */}
          <span className="inline-flex shrink-0 sm:hidden">
            <Logo variant="symbol" className="h-8" />
          </span>
          <span className="hidden shrink-0 sm:inline-flex lg:hidden">
            <Logo className="h-7" />
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts="Control+K Meta+K"
            className={cx(
              "ml-auto inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2.5 rounded-xl",
              "border border-border/70 bg-page px-3 text-body-sm text-fg-muted",
              "transition-[border-color,color,box-shadow] duration-200 ease-out-quint hover:border-fg-muted hover:text-fg hover:shadow-card",
              "md:ml-0 md:w-full md:max-w-md md:justify-start md:px-3.5 lg:max-w-lg",
            )}
          >
            <MagnifyingGlass aria-hidden="true" className="size-[1.125rem] shrink-0" />
            {/* the visible text names the button (WCAG 2.5.3); the key hint is decoration */}
            <span className="sr-only flex-1 text-left md:not-sr-only">
              {t("shell.palette.open")}
            </span>
            <kbd
              aria-hidden="true"
              className="hidden rounded-md border border-border/70 bg-surface px-1.5 py-0.5 font-sans text-caption font-semibold text-fg-muted shadow-card md:inline"
            >
              {t("shell.palette.shortcut")}
            </kbd>
          </button>
          <div className="flex items-center gap-1 sm:gap-1.5 md:ml-auto">
            {FEATURE_HEADER_ITEMS().map((Item, index) => (
              <Item key={index} />
            ))}
            {/* phones: the theme is in the account menu */}
            <ThemeSwitch tone="ghost" className="hidden sm:inline-flex" />
            <span aria-hidden="true" className="mx-1.5 hidden h-7 w-px bg-border sm:block" />
            <UserMenu me={me} />
          </div>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="ml-stagger mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8"
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
