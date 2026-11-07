import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";
import { Skeleton } from "./Skeleton";

/**
 * Whole-screen loading for the signed-in apps (session check, first route): the outline of the
 * dashboard (sidebar on wide screens, top bar, a heading and content blocks) instead of a blank
 * page with a spinner, so the app appears to load in place. Screen readers hear "Loading…".
 */
export function ShellSkeleton({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx("min-h-dvh bg-page lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]", className)}
    >
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="hidden border-r border-border/70 bg-surface p-4 lg:block">
        <Skeleton className="mb-6 h-8 w-32" />
        <Skeleton className="mb-6 h-14 w-full rounded-xl" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="mb-2 h-9 w-full rounded-lg" />
        ))}
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-col">
        <div className="flex h-16 items-center gap-4 border-b border-border/70 bg-surface px-4 lg:px-8">
          <Skeleton className="h-8 w-28 lg:hidden" />
          <Skeleton className="ml-auto h-10 w-10 rounded-xl md:mx-auto md:w-full md:max-w-md" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Skeleton className="h-9 w-64 max-w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
