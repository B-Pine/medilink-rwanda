import { useEffect, useId, useRef, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

export interface ErrorSummaryItem {
  /** Id of the field to link to; omit for errors not tied to a field (e.g. wrong password). */
  fieldId?: string;
  message: string;
}

export interface ErrorSummaryProps {
  items: ErrorSummaryItem[];
  /** Change it on every failed submit: the summary takes focus each time. */
  focusKey: number | string;
  title?: string;
  className?: string;
}

/**
 * Error summary at the top of a form (design 05 §1, design 10 §2): receives focus after a failed
 * submit, is announced (role="alert"), and links each message to its field.
 */
export function ErrorSummary({ items, focusKey, title, className }: ErrorSummaryProps) {
  const { t } = useTranslation("ui");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = `error-summary-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasItems = items.length > 0;

  useEffect(() => {
    if (hasItems) ref.current?.focus();
  }, [focusKey, hasItems]);

  if (!hasItems) return null;

  const focusField = (event: MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    event.preventDefault();
    field.focus();
    // Optional call: not every environment implements it (e.g. jsdom).
    field.scrollIntoView?.({ block: "center" });
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      className={cx("rounded-md border-2 border-danger bg-surface p-4", className)}
    >
      <h2 id={titleId} className="m-0 text-h3 text-fg">
        {title ?? t("errorSummary.title")}
      </h2>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {items.map((item, index) => (
          <li key={`${item.fieldId ?? "form"}-${index}`} className="font-semibold text-danger">
            {item.fieldId ? (
              <a
                href={`#${item.fieldId}`}
                className="text-danger"
                onClick={(event) => focusField(event, item.fieldId!)}
              >
                {item.message}
              </a>
            ) : (
              item.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
