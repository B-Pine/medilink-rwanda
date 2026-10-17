import { WarningCircle } from "@phosphor-icons/react";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

export interface CheckboxFieldProps extends Omit<ComponentPropsWithRef<"input">, "type" | "id"> {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
}

/** Checkbox with a large hit area (whole label row >= target size), hint and linked error. */
export function CheckboxField({
  id,
  label,
  hint,
  error,
  className,
  ref,
  ...inputProps
}: CheckboxFieldProps) {
  const { t } = useTranslation("ui");
  const generatedId = useId();
  const controlId = id ?? `checkbox-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {error && (
        <p id={errorId} className="m-0 flex items-start gap-1.5 font-semibold text-danger">
          <WarningCircle
            aria-hidden="true"
            weight="bold"
            className="mt-[0.2em] size-[1.1em] shrink-0"
          />
          <span>
            <span className="sr-only">{t("field.errorPrefix")}</span> {error}
          </span>
        </p>
      )}
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          id={controlId}
          type="checkbox"
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-6 shrink-0 cursor-pointer accent-primary"
          {...inputProps}
        />
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor={controlId}
            className="flex min-h-target cursor-pointer items-start pt-0.5"
          >
            <span>{label}</span>
          </label>
          {hint && (
            <p id={hintId} className="m-0 text-body-sm text-fg-muted">
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
