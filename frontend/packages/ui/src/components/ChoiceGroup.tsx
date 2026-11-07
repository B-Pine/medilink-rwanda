import { useId } from "react";

import { cx } from "../utils/cx";

export interface ChoiceGroupProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  className?: string;
}

/**
 * A short list of choices as one row of pills (dipstick results, yes / no, a few levels): native
 * radio buttons in a fieldset, so arrow keys, focus and screen readers work as for any radio
 * group. Use a select when there are more than about six options.
 */
export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  error,
  hint,
  className,
}: ChoiceGroupProps) {
  const id = `choice-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <fieldset
      aria-describedby={described || undefined}
      aria-invalid={error ? true : undefined}
      className={cx("m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0", className)}
    >
      <legend className="mb-1.5 p-0 text-body-sm font-semibold text-fg">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              "inline-flex min-h-target cursor-pointer items-center rounded-full border px-3.5 text-body-sm font-semibold",
              "transition-[background-color,border-color,color] duration-150 ease-out-quint",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2",
              value === option.value
                ? "border-primary bg-primary text-on-primary"
                : error
                  ? "border-danger/50 bg-surface text-fg hover:border-danger"
                  : "border-border bg-surface text-fg hover:border-fg-muted",
            )}
          >
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
