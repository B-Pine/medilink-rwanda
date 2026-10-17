import { WarningCircle } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

/** Props a form control receives from <Field> so label, hint and error are linked to it. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  /** Control id (also the error summary link target). Generated when omitted. */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Error message, shown under the label and linked with aria-describedby. */
  error?: string | undefined;
  /** Shows "(optional)" after the label. Fields are required by default (GOV.UK pattern). */
  optional?: boolean;
  /** Visually hide the label (it stays the accessible name). Use sparingly. */
  hideLabel?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + inline error + control (design 05 §4, design 10 §2):
 * visible <label>, hint and error tied to the control with aria-describedby, aria-invalid on error.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  hideLabel,
  className,
  children,
}: FieldProps) {
  const { t } = useTranslation("ui");
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control: FieldControlProps = { id: controlId };
  if (describedBy) control["aria-describedby"] = describedBy;
  if (error) control["aria-invalid"] = true;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className={cx("font-semibold text-fg", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="font-normal text-fg-muted"> {t("field.optional")}</span>}
      </label>
      {hint && (
        <p id={hintId} className="m-0 text-body-sm text-fg-muted">
          {hint}
        </p>
      )}
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
      {children(control)}
    </div>
  );
}

/** Shared input styling: >= 3:1 border (#7C8A9D), 40/48 px height by density. */
export const inputClassName = cx(
  "block w-full min-h-control rounded-sm border border-border-input bg-surface px-3 py-2 text-body text-fg",
  "aria-invalid:border-2 aria-invalid:border-danger",
  "disabled:cursor-not-allowed disabled:bg-subtle",
);
