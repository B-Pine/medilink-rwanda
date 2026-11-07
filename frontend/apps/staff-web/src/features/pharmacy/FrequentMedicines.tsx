import type { FavouriteMedicine } from "@medilink/api-client";
import { Badge } from "@medilink/ui";
import { Star, Storefront } from "@phosphor-icons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

/**
 * My frequent medicines (W3, #202) above the drug search: one click picks the medicine and fills
 * the dose, frequency, route and days of my latest use. Everything stays editable before saving.
 */
export function FrequentMedicines({
  items,
  onPick,
}: {
  items: FavouriteMedicine[];
  onPick: (item: FavouriteMedicine) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  if (items.length === 0) return null;
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <p
        id={labelId}
        className="m-0 flex items-center gap-1.5 text-body-sm font-semibold text-fg-secondary"
      >
        <Star aria-hidden="true" weight="fill" className="size-4 text-attention" />
        {t("pharmacy.favourites.title")}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((m) => (
          <li key={`${m.drug_code}-${m.free_text_drug}`}>
            <button
              type="button"
              onClick={() => onPick(m)}
              className="flex min-h-target w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border/60 bg-surface px-3 py-2 text-start hover:bg-brand-subtle"
            >
              <span className="font-semibold">{m.drug_display}</span>
              <span className="text-body-sm text-fg-secondary">
                {m.dose} · {t(`pharmacy.frequency.${m.frequency_code}`)}
                {m.duration_days
                  ? ` · ${t("pharmacy.favourites.days", { count: m.duration_days })}`
                  : ""}
              </span>
              {m.is_controlled && <Badge tone="warning">{t("pharmacy.flag.controlled")}</Badge>}
              {!m.available_here && (
                <Badge tone="danger" icon={Storefront}>
                  {t("pharmacy.flag.notInStock")}
                </Badge>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
