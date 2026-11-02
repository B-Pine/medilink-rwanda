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

/**
 * Surface that lifts off the page with a 1px ring and soft depth (design 03 §4), so structure
 * reads without hard borders. Dark mode keeps only the ring.
 */
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
      className={cx("rounded-card bg-surface text-fg shadow-card", PADDING[padding], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
