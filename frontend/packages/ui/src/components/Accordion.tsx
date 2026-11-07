import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** The first answer starts open, so the list never reads as a wall of questions. */
  firstOpen?: boolean;
  /** Heading level of each question (the page decides); 3 under a section <h2>. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/**
 * Questions and answers on native <details> (keyboard and screen readers for free), in one
 * hairline card. The answer opens to its height where the browser can (`ml-faq`, reduced motion
 * keeps it still).
 */
export function Accordion({
  items,
  firstOpen = true,
  headingLevel = 3,
  className,
}: AccordionProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cx(
        "overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-hairline,var(--color-border))]",
        className,
      )}
    >
      {items.map((item, index) => (
        <details
          key={item.id}
          open={firstOpen && index === 0 ? true : undefined}
          className="ml-faq group border-b border-[var(--color-hairline,var(--color-border))] last:border-b-0"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 transition-colors duration-150 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
            <Heading className="m-0 font-sans text-body font-semibold text-fg">
              {item.title}
            </Heading>
            <CaretDown
              aria-hidden="true"
              className="size-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out-quint group-open:rotate-180"
            />
          </summary>
          <div className="px-5 pb-5 text-body leading-relaxed text-fg-secondary">
            {item.content}
          </div>
        </details>
      ))}
    </div>
  );
}
