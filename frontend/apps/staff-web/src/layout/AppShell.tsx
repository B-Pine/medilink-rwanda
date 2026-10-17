import { List, X } from "@phosphor-icons/react";
import { Logo, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { useStaffMe } from "../auth/queries";
import { FacilitySwitcher } from "./FacilitySwitcher";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

const SIDEBAR_ID = "app-sidebar";

/**
 * Staff app shell (design 04 §2): sidebar (by role) + top bar (facility switcher, user menu)
 * + content. On small screens the sidebar is a disclosure opened from the top bar.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { data: me } = useStaffMe();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!me) return null; // RequireStaff guarantees the user; this only narrows the type.

  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
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
        <Sidebar me={me} id={SIDEBAR_ID} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-surface px-4 print:hidden lg:px-8">
          <FacilitySwitcher me={me} />
          <div className="ml-auto flex items-center gap-2">
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
    </div>
  );
}
