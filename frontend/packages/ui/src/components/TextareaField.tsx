import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "../utils/cx";
import { Field, inputClassName } from "./Field";

export interface TextareaFieldProps extends Omit<ComponentPropsWithRef<"textarea">, "id"> {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
}

/** Multi-line text with visible label, hint and linked inline error (like TextField). */
export function TextareaField({
  id,
  label,
  hint,
  error,
  optional,
  hideLabel,
  className,
  rows = 4,
  ref,
  ...props
}: TextareaFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      hideLabel={hideLabel}
      className={className}
    >
      {(control) => (
        <textarea
          ref={ref}
          rows={rows}
          aria-required={!optional || undefined}
          className={cx(inputClassName, "min-h-24 resize-y")}
          {...control}
          {...props}
        />
      )}
    </Field>
  );
}
