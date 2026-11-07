import { cx, MAIN_CONTENT_ID, SkipLink } from "@medilink/ui";
import { CloudSlash } from "@phosphor-icons/react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { env } from "../env";
import { AssistantLauncher } from "../features/public/AssistantLauncher";
import { useInDashboard } from "./DashboardContext";
import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";
import { useOnline } from "./useOnline";

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
  // Inside the dashboard the shell already has the header, <main> and navigation
  const inDashboard = useInDashboard();
  const online = useOnline();
  const { t } = useTranslation();
  // the public site's "clinical calm" palette (tokens.css, data-surface="site")
  useEffect(() => {
    if (inDashboard) return;
    const root = document.documentElement;
    root.dataset.surface = "site";
    return () => {
      if (root.dataset.surface === "site") delete root.dataset.surface;
    };
  }, [inDashboard]);
  if (inDashboard)
    return (
      <div className={cx("flex w-full flex-col", narrow && "mx-auto max-w-[40rem]")}>
        {children}
      </div>
    );
  return (
    <div className="ml-soft flex min-h-dvh flex-col bg-page">
      <SkipLink />
      <PublicHeader showLogin={showLogin} />
      {!online && (
        <p
          role="status"
          className="m-0 flex items-center justify-center gap-2 bg-warning-bg px-4 py-2 text-body-sm font-semibold text-fg"
        >
          <CloudSlash aria-hidden="true" className="size-5 shrink-0" />
          {t("site.offline")}
        </p>
      )}
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cx(
          // clip: the full-width page bands never add a sideways scroll
          "w-full flex-1 overflow-x-clip",
          narrow && "mx-auto max-w-[40rem] px-4 py-8 sm:px-6 sm:py-12",
        )}
      >
        {children}
      </main>
      <PublicFooter />
      {/* the AI assistant stays off the public site until it is ready (env.publicAssistant) */}
      {env.publicAssistant && <AssistantLauncher />}
    </div>
  );
}
