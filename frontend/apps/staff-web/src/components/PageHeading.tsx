import { cx } from "@medilink/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavigationType, useNavigationType } from "react-router";

/**
 * The page <h1>. After an in-app navigation it receives focus, so screen-reader and keyboard
 * users start at the new page's title (not on the initial load or back/forward).
 * Also sets document.title.
 */
export function PageHeading({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const navigationType = useNavigationType();
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("app.titleSuffix")}`;
  }, [title, t]);

  useEffect(() => {
    if (navigationType !== NavigationType.Pop) ref.current?.focus();
  }, [navigationType]);

  return (
    <h1 ref={ref} tabIndex={-1} className={cx("m-0 text-h1 text-fg focus:outline-none", className)}>
      {children}
    </h1>
  );
}
