import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cx } from "../utils/cx";
import { inputClassName } from "./Field";

export type SearchType = "medilink_number" | "national_id" | "phone" | "file_number" | "name";

/** Guess what the user typed (sprint-03 §6.1): 16 digits, `ML-…`, a phone number, digits, text. */
export function detectSearchType(query: string): SearchType {
  const value = query.trim();
  const compact = value.replace(/[\s\-.]/g, "");
  if (/^ml/i.test(compact) && compact.length >= 6) return "medilink_number";
  if (/^\d{16}$/.test(compact)) return "national_id";
  if (/^(\+?250|0)?7\d{8}$/.test(compact.replace(/^\+/, "+"))) return "phone";
  if (/\d/.test(value)) return "file_number";
  return "name";
}

export interface PersonSearchItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
}

export interface PersonSearchLabels {
  label: string;
  placeholder: string;
  types: Record<SearchType, string>;
  /** e.g. (n) => `${n} results`. */
  resultCount: (count: number) => string;
}

export interface PersonSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Submit the search (Enter without an active option). */
  onSearch: (value: string, type: SearchType) => void;
  results?: PersonSearchItem[];
  onSelect?: (item: PersonSearchItem) => void;
  labels: PersonSearchLabels;
  /** Focus the input when `/` is pressed outside a text field (NFR-UX-05). */
  slashShortcut?: boolean;
  busy?: boolean;
}

/**
 * Patient search combobox (sprint-03 §6.3): a type chip shows what the input looks like, results
 * are a listbox navigated with the arrow keys, the result count is announced politely.
 */
export function PersonSearch({
  value,
  onChange,
  onSearch,
  results,
  onSelect,
  labels,
  slashShortcut = true,
  busy,
}: PersonSearchProps) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(-1);
  const type = detectSearchType(value);
  const items = results ?? [];

  // a new result list starts without an active option
  const [listed, setListed] = useState(results);
  if (listed !== results) {
    setListed(results);
    setActive(-1);
  }

  useEffect(() => {
    if (!slashShortcut) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slashShortcut]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item && onSelect) onSelect(item);
      else if (value.trim()) onSearch(value.trim(), type);
    } else if (event.key === "Escape") {
      setActive(-1);
    }
  };

  return (
    <div className="relative w-full">
      <label htmlFor={id} className="mb-1 block text-small font-medium text-fg">
        {labels.label}
      </label>
      <div className="relative flex items-center">
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute left-3 text-fg-muted"
        />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-busy={busy || undefined}
          autoComplete="off"
          className={cx(inputClassName, "pl-9 pr-32")}
          placeholder={labels.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {value.trim() && (
          <span
            className="absolute right-2 rounded-sm bg-subtle px-2 py-0.5 text-small text-fg-muted"
            data-testid="search-type"
          >
            {labels.types[type]}
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {results ? labels.resultCount(items.length) : ""}
      </p>
      {items.length > 0 && (
        // Combobox pattern: options are driven by the input's arrow keys and Enter.
        <div
          id={listId}
          role="listbox"
          aria-label={labels.label}
          className="mt-1 max-h-80 overflow-auto rounded-md border border-border bg-raised p-1 shadow-raised"
        >
          {items.map((item, index) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- combobox: focus stays on the input (aria-activedescendant)
            <div
              key={item.id}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              className={cx(
                "flex min-h-target cursor-pointer flex-col justify-center rounded-sm px-3 py-1.5",
                index === active && "bg-subtle",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect?.(item)}
            >
              <span className="text-body text-fg">{item.label}</span>
              {item.description && (
                <span className="text-small text-fg-muted">{item.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
