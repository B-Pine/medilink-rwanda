import { Check } from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "../utils/cx";

/**
 * Accessible dropdown menu (Radix primitive wrapped with MediLink styles):
 * keyboard navigation, typeahead, focus return to the trigger, Escape to close.
 */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export function MenuContent({
  className,
  children,
  align = "end",
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cx(
          "z-50 min-w-60 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-raised p-1 text-fg shadow-raised",
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

const itemClass =
  "relative flex min-h-target cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-body " +
  "data-[highlighted]:bg-brand-subtle data-[highlighted]:text-on-brand-subtle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60";

export function MenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item className={cx(itemClass, className)} {...props} />;
}

export function MenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cx("px-3 pt-2 pb-1 text-body-sm font-semibold text-fg-muted", className)}
      {...props}
    />
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <DropdownMenu.Separator className={cx("my-1 h-px bg-border", className)} />;
}

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.RadioItem> & { children: ReactNode }) {
  return (
    <DropdownMenu.RadioItem className={cx(itemClass, "pl-9", className)} {...props}>
      <span className="absolute left-3 inline-flex size-4 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check aria-hidden="true" weight="bold" className="size-4" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.RadioItem>
  );
}
