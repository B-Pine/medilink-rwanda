import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../utils/cx";

/** Text for screen readers only (still in the accessibility tree). */
export function VisuallyHidden({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cx("sr-only", className)} {...props} />;
}
