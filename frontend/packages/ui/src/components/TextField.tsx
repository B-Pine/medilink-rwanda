import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "../utils/cx";
import { Field, inputClassName } from "./Field";

export interface TextFieldProps extends Omit<ComponentPropsWithRef<"input">, "id"> {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  hideLabel?: boolean;
  /** Class of the wrapper. Use `inputClassName` to style the <input>. */
  className?: string;
  inputClassName?: string;
}

/** Text input with visible label, hint and linked inline error. Never blocks paste. */
export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  hideLabel,
  className,
  inputClassName: inputClass,
  type = "text",
  ref,
  ...inputProps
}: TextFieldProps) {
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
        <input
          ref={ref}
          type={type}
          aria-required={!optional || undefined}
          className={cx(inputClassName, inputClass)}
          {...control}
          {...inputProps}
        />
      )}
    </Field>
  );
}
