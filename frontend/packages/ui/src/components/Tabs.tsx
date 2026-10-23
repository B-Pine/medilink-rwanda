import * as RadixTabs from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../utils/cx";

/** Accessible tabs (Radix): arrow keys move between tabs, the panel follows. */
export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cx("flex flex-wrap gap-1 border-b border-border", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cx(
        "-mb-px min-h-control cursor-pointer border-b-2 border-transparent px-3 py-2 text-body font-semibold text-fg-secondary",
        "hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg",
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
  return <RadixTabs.Content className={cx("pt-4", className)} {...props} />;
}
