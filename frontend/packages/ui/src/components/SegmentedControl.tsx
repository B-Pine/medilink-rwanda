import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../utils/cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "View". */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  /** Stretch the segments to the full width (phones). */
  fullWidth?: boolean;
}

/**
 * Two to four mutually exclusive views (List / Map): a radio group in one pill. Arrow keys move
 * and select, one tab stop for the group, the selected segment is a raised white chip.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  fullWidth = false,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (current + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex gap-1 rounded-full bg-subtle p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = index === current;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onChange(option.value)}
            className={cx(
              "inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-body-sm font-semibold",
              "transition-[background-color,color,box-shadow] duration-150 ease-out-quint",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              fullWidth && "flex-1",
              selected
                ? "bg-surface text-fg shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
                : "text-fg-secondary hover:text-fg",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
