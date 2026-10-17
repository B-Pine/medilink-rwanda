import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "../utils/cx";
import { Field, inputClassName } from "./Field";

export interface SelectFieldProps extends Omit<ComponentPropsWithRef<"select">, "id"> {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
  selectClassName?: string;
}

/** Native <select> (most robust with keyboards, screen readers and cheap phones). */
export function SelectField({
  id,
  label,
  hint,
  error,
  optional,
  hideLabel,
  className,
  selectClassName,
  children,
  ref,
  ...selectProps
}: SelectFieldProps) {
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
        <select
          ref={ref}
          className={cx(inputClassName, "pr-8", selectClassName)}
          {...control}
          {...selectProps}
        >
          {children}
        </select>
      )}
    </Field>
  );
}
