import type { ClinicalFavourites } from "@medilink/api-client";
import { Star } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { diagnosisLabel } from "./orderSet";
import { useCan } from "./shared";

export const favouritesKey = ["clinical", "favourites"] as const;

/**
 * My most used diagnoses and medicines (W3, #202), derived by the API from my own signed work.
 * Fetched once per few minutes; an error just means no shortcuts.
 */
export function useFavourites(enabled = true) {
  const api = useApi();
  const allowed = useCan("clinical.write");
  return useQuery({
    queryKey: favouritesKey,
    queryFn: () => api.clinical.favourites(),
    enabled: enabled && allowed,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Position in my favourites (lower first), for sorting search results; others go last. */
export function favouriteRank<T>(list: T[], same: (item: T) => boolean): number {
  const index = list.findIndex(same);
  return index === -1 ? list.length : index;
}

type FavouriteDiagnosis = ClinicalFavourites["diagnoses"][number];

/** One-click chips under the ICD-10 search: my frequent diagnoses not yet chosen. */
export function FrequentDiagnoses({
  items,
  chosen,
  onPick,
}: {
  items: FavouriteDiagnosis[];
  chosen: Set<string>;
  onPick: (item: FavouriteDiagnosis) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const open = items.filter((d) => !chosen.has(d.code));
  if (open.length === 0) return null;
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <p
        id={labelId}
        className="m-0 flex items-center gap-1.5 text-body-sm font-semibold text-fg-secondary"
      >
        <Star aria-hidden="true" weight="fill" className="size-4 text-attention" />
        {t("clinical.favourites.diagnoses")}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {open.map((d) => (
          <li key={d.code}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-label={t("clinical.favourites.add", { name: `${d.code} ${diagnosisLabel(d)}` })}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-body-sm ring-1 ring-border transition-colors hover:bg-brand-subtle focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <span className="font-mono font-semibold">{d.code}</span>
              <span>{d.plain_language || d.display}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
