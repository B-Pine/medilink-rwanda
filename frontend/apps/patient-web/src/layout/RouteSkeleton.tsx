import { LoadingState, Skeleton } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import { PublicLayout } from "./PublicLayout";

/**
 * First load of a page (redesign: "never a full-screen spinner"): the header and footer show at
 * once and grey blocks hold the page's shape until its code arrives. The signed-in app keeps its
 * own loader, as its shell is different.
 */
export function RouteSkeleton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (pathname.startsWith("/dashboard")) return <LoadingState className="min-h-dvh" />;
  return (
    <PublicLayout>
      <div
        role="status"
        aria-label={t("site.loading")}
        className="mx-auto flex w-full max-w-[88rem] flex-col gap-6 px-4 pt-10 pb-16 sm:px-6"
      >
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-11 w-full max-w-[32rem] rounded-xl" />
        <Skeleton className="h-5 w-full max-w-[40rem] rounded-md" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
