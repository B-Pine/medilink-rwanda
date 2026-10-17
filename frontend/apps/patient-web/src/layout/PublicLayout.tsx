import { cx, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import type { ReactNode } from "react";

import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";

/** Public pages and auth screens: header, <main>, footer with the emergency notice. */
export function PublicLayout({
  children,
  narrow = false,
  showLogin = true,
}: {
  children: ReactNode;
  /** Single column, max 640px (design 03 §4 patient layout) for forms. */
  narrow?: boolean;
  showLogin?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <SkipLink />
      <PublicHeader showLogin={showLogin} />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cx(
          "w-full flex-1",
          narrow && "mx-auto max-w-[40rem] px-4 py-8 sm:px-6 sm:py-12",
        )}
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
