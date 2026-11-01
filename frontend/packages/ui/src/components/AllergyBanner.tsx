import { CheckCircle, Question, WarningOctagon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface AllergyBannerItem {
  id: string;
  substance: string;
  /** Already translated, e.g. "Severe · Hives". */
  detail?: string;
  /** Unverified (patient-reported) entries carry a label, never colour alone. */
  unverifiedLabel?: string;
}

export interface AllergyBannerProps {
  allergies: AllergyBannerItem[];
  /** The patient said no known allergies (S3 `no_known_allergies = true`). */
  noKnownAllergies: boolean | null;
  /** "Allergy" / "Allergies" heading in the UI language. */
  title: string;
  noneLabel: string;
  unknownLabel: string;
  className?: string;
  action?: ReactNode;
}

/**
 * Permanent allergy banner on every consultation and prescription screen (design 04 §3.2,
 * FR-CLN-07): red with an icon and the substances when there are allergies; a neutral line when
 * the patient has none, or when nobody has asked yet. Icon + text, never colour alone.
 */
export function AllergyBanner({
  allergies,
  noKnownAllergies,
  title,
  noneLabel,
  unknownLabel,
  className,
  action,
}: AllergyBannerProps) {
  if (allergies.length) {
    return (
      <section
        aria-label={title}
        className={cx(
          "flex flex-wrap items-start gap-3 rounded-md border-l-4 border-danger bg-danger-bg p-3 text-fg",
          className,
        )}
      >
        <WarningOctagon
          aria-hidden="true"
          weight="bold"
          className="mt-0.5 size-icon shrink-0 text-danger"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 font-semibold">{title}</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
            {allergies.map((a) => (
              <li key={a.id} className="m-0">
                <span className="font-semibold">{a.substance}</span>
                {a.detail && <span className="text-fg-secondary"> · {a.detail}</span>}
                {a.unverifiedLabel && (
                  <span className="text-fg-secondary"> · {a.unverifiedLabel}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        {action}
      </section>
    );
  }
  const Icon = noKnownAllergies ? CheckCircle : Question;
  return (
    <section
      aria-label={title}
      className={cx(
        "flex items-center gap-3 rounded-md border border-border bg-surface p-3 text-fg-secondary",
        className,
      )}
    >
      <Icon aria-hidden="true" weight="bold" className="size-icon shrink-0" />
      <p className="m-0">{noKnownAllergies ? noneLabel : unknownLabel}</p>
      {action}
    </section>
  );
}
