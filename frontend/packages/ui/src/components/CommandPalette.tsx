import * as RadixDialog from "@radix-ui/react-dialog";
import { MagnifyingGlass, type Icon } from "@phosphor-icons/react";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../utils/cx";
import { Spinner } from "./Spinner";

export interface CommandRow {
  id: string;
  label: string;
  description?: string | undefined;
  icon?: Icon | undefined;
  /** Shows a spinner instead of the icon (e.g. a search that is running). */
  busy?: boolean | undefined;
}

export interface CommandGroup {
  id: string;
  heading: string;
  rows: CommandRow[];
}

export interface CommandPaletteLabels {
  title: string;
  placeholder: string;
  /** Shown when no group has rows. */
  empty: string;
  /** Keyboard hints in the footer, e.g. "↑ ↓ move · Enter open · Esc close". */
  hints: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  groups: CommandGroup[];
  onSelect: (row: CommandRow) => void;
  labels: CommandPaletteLabels;
  /** Extra content under the list, e.g. an error alert. */
  footer?: ReactNode;
}

/**
 * Command palette (design 04 §2, Ctrl+K): a modal combobox. Arrow keys move through the rows of
 * every group, Enter selects, Escape closes and returns focus to the trigger.
 */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  groups,
  onSelect,
  labels,
  footer,
}: CommandPaletteProps) {
  const listId = useId();
  const rows = groups.flatMap((group) => group.rows);
  const [active, setActive] = useState(0);

  // a new row list starts on its first row
  const signature = rows.map((row) => row.id).join("|");
  const [listed, setListed] = useState(signature);
  if (listed !== signature) {
    setListed(signature);
    setActive(0);
  }

  const activeRow = rows[Math.min(active, rows.length - 1)];
  const optionId = (row: CommandRow) => `${listId}-${row.id}`;

  useEffect(() => {
    if (!activeRow) return;
    const node = document.getElementById(optionId(activeRow));
    node?.scrollIntoView?.({ block: "nearest" });
    // optionId only depends on listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + rows.length) % rows.length);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(rows.length - 1);
    } else if (event.key === "Enter" && activeRow) {
      event.preventDefault();
      onSelect(activeRow);
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/40" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cx(
            "fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col",
            "overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-lg",
          )}
        >
          <RadixDialog.Title className="sr-only">{labels.title}</RadixDialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <MagnifyingGlass aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
            <input
              type="text"
              role="combobox"
              aria-label={labels.title}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeRow ? optionId(activeRow) : undefined}
              autoComplete="off"
              spellCheck={false}
              value={query}
              placeholder={labels.placeholder}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-h-14 flex-1 border-0 bg-transparent text-h3 font-normal text-fg placeholder:text-fg-muted focus:outline-none"
            />
          </div>
          <div id={listId} role="listbox" className="overflow-y-auto p-2">
            {rows.length === 0 && (
              <p role="presentation" className="m-0 px-3 py-6 text-center text-fg-muted">
                {labels.empty}
              </p>
            )}
            {groups
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <div
                  key={group.id}
                  role="group"
                  aria-labelledby={`${listId}-${group.id}-heading`}
                  className="pb-1"
                >
                  <p
                    id={`${listId}-${group.id}-heading`}
                    role="presentation"
                    className="m-0 px-3 pt-2 pb-1 text-caption font-semibold tracking-wide text-fg-muted uppercase"
                  >
                    {group.heading}
                  </p>
                  {group.rows.map((row) => {
                    const isActive = row === activeRow;
                    const RowIcon = row.icon;
                    return (
                      // Keyboard use goes through the combobox input (aria-activedescendant), so
                      // the options are not tab stops and have no key handlers of their own.
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={row.id}
                        id={optionId(row)}
                        role="option"
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        aria-selected={isActive}
                        onMouseMove={() => setActive(rows.indexOf(row))}
                        onClick={() => onSelect(row)}
                        className={cx(
                          "flex min-h-target cursor-pointer items-center gap-3 rounded-md px-3 py-1.5",
                          isActive ? "bg-brand-subtle text-on-brand-subtle" : "text-fg",
                        )}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          {row.busy ? (
                            <Spinner size="sm" />
                          ) : (
                            RowIcon && (
                              <RowIcon
                                aria-hidden="true"
                                weight={isActive ? "fill" : "regular"}
                                className="size-5"
                              />
                            )
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{row.label}</span>
                          {row.description && (
                            <span
                              className={cx(
                                "truncate text-body-sm",
                                isActive ? "text-on-brand-subtle" : "text-fg-muted",
                              )}
                            >
                              {row.description}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
          {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
          <p className="m-0 hidden border-t border-border bg-subtle px-4 py-2 text-caption text-fg-muted sm:block">
            {labels.hints}
          </p>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
