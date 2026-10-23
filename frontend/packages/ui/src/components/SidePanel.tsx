import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";
import { Button } from "./Button";

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Row detail drawer (design 08 §4): slides in from the end edge, full screen under 640 px,
 * focus-trapped; focus returns to the row (the trigger) when it closes.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  footer,
}: SidePanelProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/30" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cx(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface text-fg shadow-lg",
            "sm:max-w-xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <RadixDialog.Title className="m-0 font-heading text-h3">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" aria-label={closeLabel} className="-mr-2 px-2">
                <X aria-hidden="true" weight="bold" />
              </Button>
            </RadixDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
