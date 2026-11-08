import { CaretDown } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";

import { readPreference, writePreference } from "../preferences/storage";
import { cx } from "../utils/cx";

function hiddenGroups(): Set<string> {
  return new Set((readPreference("navHidden") ?? "").split(",").filter(Boolean));
}

function saveHidden(id: string, hidden: boolean) {
  const set = hiddenGroups();
  if (hidden) set.add(id);
  else set.delete(id);
  writePreference("navHidden", set.size ? [...set].join(",") : null);
}

export interface NavGroupProps {
  /** Stable id for the saved choice, e.g. "patient.health" or "staff.manage". */
  id: string;
  title: string;
  /** The sidebar is shrunk to icons: no header to click, every item stays visible. */
  railed?: boolean;
  /** Where the shrunk sidebar applies: everywhere, or from the `lg` breakpoint (staff drawer). */
  railedAt?: "always" | "lg";
  /** The current page is in this group: going to that page shows the group again. */
  containsActive?: boolean;
  children: ReactNode;
}

const LABEL = "text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-muted uppercase";

/**
 * A sidebar group the person can hide and show again (product owner 2026-11-08: group the
 * dashboard menus so someone can hide what they do not need). The header is a button with
 * aria-expanded; the choice is kept on this device. A hidden group opens again when the person
 * goes to a page inside it, so the current page is never lost.
 */
export function NavGroup({
  id,
  title,
  railed = false,
  railedAt = "always",
  containsActive = false,
  children,
}: NavGroupProps) {
  const listId = useId();
  const [open, setOpen] = useState(() => !hiddenGroups().has(id));
  // going to a page inside a hidden group shows the group again (state adjusted while rendering)
  const [wasActive, setWasActive] = useState(containsActive);
  if (containsActive !== wasActive) {
    setWasActive(containsActive);
    if (containsActive) setOpen(true);
  }
  const toggle = () => {
    saveHidden(id, open);
    setOpen(!open);
  };
  const railAlways = railed && railedAt === "always";
  const railLg = railed && railedAt === "lg";
  return (
    <div className="flex flex-col">
      {railed && <p className={cx("m-0 sr-only", LABEL, railLg && "hidden lg:block")}>{title}</p>}
      {!railAlways && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          className={cx(
            "mt-3 flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 text-left",
            "transition-colors duration-150 ease-out-quint hover:bg-subtle hover:text-fg",
            LABEL,
            railLg && "lg:hidden",
          )}
        >
          <span className="truncate">{title}</span>
          <CaretDown
            aria-hidden="true"
            weight="bold"
            className={cx(
              "size-3 shrink-0 transition-transform duration-200 ease-out-quint",
              !open && "-rotate-90",
            )}
          />
        </button>
      )}
      <div
        id={listId}
        // closed: the hidden attribute; staff below lg keeps it closed by class, so the icon rail
        // from lg still shows every item
        hidden={!open && !railed}
        className={cx(railAlways ? "pt-3" : "pt-1", !open && railLg && "hidden lg:block")}
      >
        {children}
      </div>
    </div>
  );
}
