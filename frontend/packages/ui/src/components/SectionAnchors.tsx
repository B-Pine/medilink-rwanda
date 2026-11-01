import { cx } from "../utils/cx";

export interface SectionAnchor {
  id: string;
  label: string;
}

export interface SectionAnchorsProps {
  sections: SectionAnchor[];
  /** Accessible name of the navigation, e.g. "Consultation sections". */
  label: string;
  className?: string;
}

/**
 * Section tabs as anchors on one scrolling page (design 04 §3.2: "one scrolling page with section
 * tabs as anchors, not separate pages"). Plain links, so the browser history, keyboard and screen
 * readers behave as expected; scrolling is smooth only without reduced motion.
 */
export function SectionAnchors({ sections, label, className }: SectionAnchorsProps) {
  return (
    <nav aria-label={label} className={cx("overflow-x-auto", className)}>
      <ul className="m-0 flex list-none gap-1 p-0">
        {sections.map((section) => (
          <li key={section.id} className="m-0 shrink-0">
            <a
              href={`#${section.id}`}
              onClick={(event) => {
                const target = document.getElementById(section.id);
                if (!target) return;
                event.preventDefault();
                const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                target.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
                target.focus({ preventScroll: true });
              }}
              className="inline-flex min-h-10 items-center rounded-md px-3 text-body-sm font-semibold text-link transition-colors duration-150 hover:bg-surface"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
