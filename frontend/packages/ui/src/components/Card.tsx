import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cx } from "../utils/cx";

type CardProps<T extends ElementType> = {
  as?: T;
  children?: ReactNode;
  className?: string;
  /** Inner spacing; `none` for cards that lay out their own content. */
  padding?: "none" | "md" | "lg";
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

const PADDING = { none: "", md: "p-4", lg: "p-6" } as const;

/** Surface with a subtle border (elevation is mostly borders, design 03 §4). */
export function Card<T extends ElementType = "div">({
  as,
  children,
  className,
  padding = "lg",
  ...props
}: CardProps<T>) {
  const Component: ElementType = as ?? "div";
  return (
    <Component
      className={cx(
        "rounded-card border border-border bg-surface text-fg",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
