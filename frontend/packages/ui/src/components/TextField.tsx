import { MagnifyingGlass } from "@phosphor-icons/react";
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

/**
 * Text input with visible label, hint and linked inline error. Never blocks paste. A `search`
 * field shows a magnifier at its start, so every search box in the apps looks the same.
 */
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
      {(control) => {
        const input = (
          <input
            ref={ref}
            type={type}
            aria-required={!optional || undefined}
            className={cx(inputClassName, type === "search" && "pl-9", inputClass)}
            {...control}
            {...inputProps}
          />
        );
        if (type !== "search") return input;
        return (
          <span className="relative flex items-center">
            <MagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-3 size-4 text-fg-muted"
            />
            {input}
          </span>
        );
      }}
    </Field>
  );
}
