import { useTranslation } from "react-i18next";

export const MAIN_CONTENT_ID = "main-content";

/**
 * First focusable element of every page (design 10 §2): jumps to <main id="main-content">.
 * The target needs tabIndex={-1} so focus actually moves there.
 */
export function SkipLink({ targetId = MAIN_CONTENT_ID }: { targetId?: string }) {
  const { t } = useTranslation("ui");
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-target focus:items-center focus:rounded-md focus:bg-surface focus:px-4 focus:font-semibold focus:text-fg focus:shadow-raised"
    >
      {t("skipLink")}
    </a>
  );
}
