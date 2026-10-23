import * as RadixSwitch from "@radix-ui/react-switch";
import { useId, type ReactNode } from "react";

import { cx } from "../utils/cx";

export interface SwitchFieldProps {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Text after the switch for its state ("On"/"Off"): state is never shown by colour alone. */
  stateLabel?: ReactNode;
  className?: string;
}

/** On/off switch with a visible label and hint (role="switch", Space toggles). */
export function SwitchField({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  stateLabel,
  className,
}: SwitchFieldProps) {
  const generated = useId();
  const controlId = id ?? `switch-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={controlId} className="font-semibold text-fg">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="m-0 text-body-sm text-fg-muted">
            {hint}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {stateLabel && <span className="text-body-sm text-fg-secondary">{stateLabel}</span>}
        <RadixSwitch.Root
          id={controlId}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-describedby={hintId}
          className={cx(
            "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-border-input bg-subtle",
            "data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
        </RadixSwitch.Root>
      </div>
    </div>
  );
}
