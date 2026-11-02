import { Slot, Slottable } from "@radix-ui/react-slot";
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";

import { cx } from "../utils/cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  /** `lg` = primary action height (56px patient, 40px staff); `sm` = dense rows (staff lists). */
  size?: ButtonSize;
  /** Busy: shows a spinner, sets aria-busy and ignores clicks, but keeps focus (unlike disabled). */
  loading?: boolean;
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Render the child element (e.g. a router Link) with button styles. */
  asChild?: boolean;
  /** Fully rounded (public pages, upgrade 2026-11-02); controls are 6 px otherwise. */
  pill?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover border border-transparent",
  secondary:
    "bg-surface text-fg border border-border shadow-card hover:border-fg-muted hover:bg-subtle/60",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-subtle",
  danger: "bg-danger-solid text-on-danger-solid border border-transparent hover:bg-danger-solid/90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1 text-body-sm",
  md: "min-h-control px-4 py-2 text-body",
  lg: "min-h-control-primary px-6 py-2 text-body",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  pill = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "pill" | "className">): string {
  return cx(
    // Text may wrap to two lines (long Kinyarwanda labels, design 03 §2); no fixed widths.
    "inline-flex items-center justify-center gap-2 text-center font-semibold no-underline",
    pill ? "rounded-full" : "rounded-xl",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-out cursor-pointer select-none",
    "enabled:active:scale-[0.97] motion-reduce:enabled:active:scale-100",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-70 disabled:cursor-not-allowed disabled:opacity-70",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  iconStart,
  iconEnd,
  asChild = false,
  pill = false,
  className,
  children,
  type,
  onClick,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <Component
      {...(asChild ? {} : { type: type ?? "button" })}
      className={buttonClassName({ variant, size, fullWidth, pill, className })}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : iconStart}
      <Slottable>{children}</Slottable>
      {!loading && iconEnd}
    </Component>
  );
}
