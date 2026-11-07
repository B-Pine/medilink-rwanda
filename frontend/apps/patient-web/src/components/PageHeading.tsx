import { cx } from "@medilink/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavigationType, useNavigationType } from "react-router";

import { usePageMeta } from "../features/site/seo";

/**
 * The page <h1>. After an in-app navigation it receives focus, so screen-reader and keyboard
 * users start at the new page's title (not on the initial load or back/forward).
 * Also sets document.title and the search tags (every page has one heading, so no page keeps
 * the previous page's description or structured data).
 */
export function PageHeading({
  children,
  title,
  id,
  className,
  description,
  jsonLd,
}: {
  children: ReactNode;
  title: string;
  id?: string;
  className?: string;
  /** Search description; defaults to the page's own (`site.meta`), else the site's. */
  description?: string;
  /** Structured data for search engines (schema.org). */
  jsonLd?: Record<string, unknown> | null;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const navigationType = useNavigationType();
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("app.titleSuffix")}`;
  }, [title, t]);
  usePageMeta({ title, description, jsonLd });

  useEffect(() => {
    if (navigationType !== NavigationType.Pop) ref.current?.focus();
  }, [navigationType]);

  return (
    <h1
      ref={ref}
      id={id}
      tabIndex={-1}
      className={cx("m-0 focus:outline-none", className ?? "text-h1 text-fg")}
    >
      {children}
    </h1>
  );
}
