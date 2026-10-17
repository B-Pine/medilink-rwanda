import { Slot, Slottable } from "@radix-ui/react-slot";
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";

import { cx } from "../utils/cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  /** `lg` = primary action height (56px patient, 40px staff). */
  size?: ButtonSize;
  /** Busy: shows a spinner, sets aria-busy and ignores clicks, but keeps focus (unlike disabled). */
  loading?: boolean;
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Render the child element (e.g. a router Link) with button styles. */
  asChild?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover border border-transparent",
  secondary: "bg-surface text-fg border border-border-input hover:bg-subtle",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-subtle",
  danger: "bg-danger-solid text-on-danger-solid border border-transparent hover:bg-danger-solid/90",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-control px-4",
  lg: "min-h-control-primary px-6",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "className">): string {
  return cx(
    // Text may wrap to two lines (long Kinyarwanda labels, design 03 §2); no fixed widths.
    "inline-flex items-center justify-center gap-2 rounded-md py-2 text-center text-body font-semibold no-underline",
    "transition-colors duration-150 ease-out cursor-pointer select-none",
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
      className={buttonClassName({ variant, size, fullWidth, className })}
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
