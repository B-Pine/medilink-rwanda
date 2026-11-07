import * as RadixTabs from "@radix-ui/react-tabs";
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";

import { cx } from "../utils/cx";

/** Accessible tabs (Radix): arrow keys move between tabs, the panel follows. */
export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cx(
        "inline-flex max-w-full flex-wrap gap-1 self-start rounded-full bg-subtle p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  const ref = useRef<HTMLButtonElement>(null);
  // Tabs used as filters have no panel: `aria-controls` must not point at a missing element
  // (axe aria-valid-attr-value). A trigger without it is still a valid tab.
  useLayoutEffect(() => {
    const el = ref.current;
    const target = el?.getAttribute("aria-controls");
    if (el && target && !document.getElementById(target)) el.removeAttribute("aria-controls");
  });
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cx(
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold whitespace-nowrap text-fg-secondary",
        "transition-[background-color,color,box-shadow] duration-200 ease-out-quint",
        "hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cx("animate-enter pt-5", className)} {...props} />;
}
