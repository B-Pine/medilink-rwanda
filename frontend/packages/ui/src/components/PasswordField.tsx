import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";
import { Field, inputClassName } from "./Field";
import type { TextFieldProps } from "./TextField";

export interface PasswordFieldProps extends Omit<TextFieldProps, "type"> {
  /** `current-password` (login) or `new-password` (sign-up, reset). */
  autoComplete: "current-password" | "new-password";
}

/**
 * Password input with a show/hide toggle instead of "confirm password" (design 05 §1).
 * Paste and password managers are allowed (WCAG 2.2 Accessible Authentication).
 */
export function PasswordField({
  id,
  label,
  hint,
  error,
  optional,
  hideLabel,
  className,
  inputClassName: inputClass,
  ref,
  ...inputProps
}: PasswordFieldProps) {
  const { t } = useTranslation("ui");
  const [visible, setVisible] = useState(false);

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
        <div className="relative">
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            aria-required={!optional || undefined}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cx(inputClassName, "pr-28", inputClass)}
            {...control}
            {...inputProps}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-controls={control.id}
            className="absolute inset-y-0 right-0 my-auto mr-1 inline-flex min-h-target items-center gap-1.5 rounded-sm px-3 text-body-sm font-semibold text-link hover:bg-subtle"
          >
            {visible ? (
              <EyeSlash aria-hidden="true" className="size-5" />
            ) : (
              <Eye aria-hidden="true" className="size-5" />
            )}
            <span aria-hidden="true">{visible ? t("password.hide") : t("password.show")}</span>
            <span className="sr-only">
              {visible ? t("password.hideLabel") : t("password.showLabel")}
            </span>
          </button>
        </div>
      )}
    </Field>
  );
}
