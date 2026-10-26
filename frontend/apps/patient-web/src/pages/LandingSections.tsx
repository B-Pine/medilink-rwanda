import {
  CaretDown,
  CheckCircle,
  FileText,
  Lock,
  Pill,
  QrCode,
  Receipt,
  SealCheck,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** Example ticket on the tracker mockup (not personal data). */
const EXAMPLE_TICKET = "G-023";

/**
 * Design 06 §3 "The live tracker — the unique feature, shown, not described": a phone with an
 * example ticket (marked as an example; no invented statistics, condition H6).
 */
export function TrackerShowcase() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="tracker-title" className="overflow-hidden bg-surface">
      <div className="mx-auto grid max-w-[70rem] items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
        <div className="flex flex-col gap-4">
          <h2 id="tracker-title" className="m-0 text-h1">
            {t("landing.tracker.title")}
          </h2>
          <p className="m-0 max-w-lg text-fg-secondary">{t("landing.tracker.body")}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(["ahead", "leave", "called"] as const).map((key) => (
              <li key={key} className="flex items-start gap-3">
                <CheckCircle
                  aria-hidden="true"
                  weight="fill"
                  className="mt-0.5 size-icon shrink-0 text-brand"
                />
                <span>{t(`landing.tracker.points.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className="m-0 flex justify-center" aria-labelledby="tracker-caption">
          <div className="w-72 rounded-[2.5rem] border-[10px] border-forest bg-forest p-1 shadow-raised">
            <div className="flex flex-col gap-4 rounded-[1.9rem] bg-page px-5 pt-6 pb-6">
              <p className="m-0 text-center text-body-sm text-fg-secondary">
                {t("landing.tracker.mockFacility")}
              </p>
              <div className="flex flex-col items-center gap-1">
                <span className="font-heading text-display font-bold tracking-wider text-fg tabular-nums">
                  {EXAMPLE_TICKET}
                </span>
                <span className="text-body-sm text-fg-secondary">
                  {t("landing.tracker.mockTicket")}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span aria-hidden="true" className="flex gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={`size-3 rounded-full ${i < 4 ? "bg-primary" : "border-2 border-primary"}`}
                    />
                  ))}
                </span>
                <span className="font-semibold">{t("landing.tracker.mockAhead")}</span>
              </div>
              <div className="rounded-lg bg-brand-subtle px-4 py-3 text-center text-on-brand-subtle">
                <p className="m-0 font-heading text-h3 tabular-nums">
                  {t("landing.tracker.mockWait")}
                </p>
                <p className="m-0 text-body-sm tabular-nums">{t("landing.tracker.mockLeave")}</p>
              </div>
              <span className="flex min-h-12 items-center justify-center rounded-md bg-primary px-3 text-center font-semibold text-on-primary">
                {t("landing.tracker.mockCheckIn")}
              </span>
            </div>
          </div>
        </figure>
        <p id="tracker-caption" className="sr-only">
          {t("landing.tracker.caption")}
        </p>
      </div>
    </section>
  );
}

const RECORDS: { key: string; icon: Icon }[] = [
  { key: "prescriptions", icon: Pill },
  { key: "receipts", icon: Receipt },
  { key: "notes", icon: FileText },
  { key: "qr", icon: QrCode },
];

/** Design 06 §3 "Your records in one place — prescriptions, receipts, sick notes, QR". */
export function RecordsSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="records-title">
      <div className="mx-auto flex max-w-[70rem] flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 id="records-title" className="m-0 text-h1">
            {t("landing.records.title")}
          </h2>
          <p className="m-0 text-fg-secondary">{t("landing.records.body")}</p>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {RECORDS.map(({ key, icon: RecordIcon }) => (
            <li
              key={key}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
            >
              <RecordIcon aria-hidden="true" weight="duotone" className="size-8 text-brand" />
              <h3 className="m-0 text-h3">{t(`landing.records.items.${key}.title`)}</h3>
              <p className="m-0 text-body-sm text-fg-secondary">
                {t(`landing.records.items.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const TRUST: { key: string; icon: Icon }[] = [
  { key: "rwanda", icon: ShieldCheck },
  { key: "encrypted", icon: Lock },
  { key: "verified", icon: SealCheck },
];

/** Design 06 §3 trust band: data in Rwanda, encrypted, verified facilities only (no numbers yet, H6). */
export function TrustSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="trust-title" className="border-y border-border bg-surface">
      <div className="mx-auto flex max-w-[70rem] flex-col gap-6 px-4 py-12 sm:px-6">
        <h2 id="trust-title" className="m-0 text-h2">
          {t("landing.trust.title")}
        </h2>
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
          {TRUST.map(({ key, icon: TrustIcon }) => (
            <li key={key} className="flex items-start gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-on-brand-subtle">
                <TrustIcon aria-hidden="true" weight="bold" className="size-6" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-h3">{t(`landing.trust.points.${key}.title`)}</h3>
                <p className="m-0 text-body-sm text-fg-secondary">
                  {t(`landing.trust.points.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ = ["insurance", "cost", "privacy", "smartphone"] as const;

/** Design 06 §3 FAQ: insurance, cost, privacy, no smartphone. Native disclosure, keyboard-ready. */
export function FaqSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="faq-title">
      <div className="mx-auto flex max-w-[48rem] flex-col gap-6 px-4 py-12 sm:px-6 lg:py-16">
        <h2 id="faq-title" className="m-0 text-h1">
          {t("landing.faq.title")}
        </h2>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {FAQ.map((key) => (
            <details key={key} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                {t(`landing.faq.items.${key}.q`)}
                <CaretDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="m-0 pb-4 text-fg-secondary">{t(`landing.faq.items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
