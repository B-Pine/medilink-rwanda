import type { MediLinkApi, StaffMe } from "@medilink/api-client";
import type { Icon } from "@phosphor-icons/react";
import type { TFunction } from "i18next";

/** One row of the command palette (Ctrl+K, design 04 §2): selecting it navigates to `to`. */
export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: Icon;
  to: string;
}

/**
 * What a feature adds to the command palette (FeatureRoutes.commands).
 *
 * Searches run only when the user picks the "search for …" row (never per keystroke): patient
 * searches are audited and rate-limited, and the query is never cached or put in the URL.
 */
export interface CommandProvider {
  /** Static actions such as "New walk-in"; return [] when the user cannot use them. */
  actions?: (me: StaffMe, t: TFunction) => PaletteItem[];
  search?: {
    id: string;
    visible: (me: StaffMe) => boolean;
    minLength: number;
    /** Label of the row that runs the search, e.g. `Search patients for “amina”`. */
    label: (query: string, t: TFunction) => string;
    /** Heading of the result group. */
    heading: (t: TFunction) => string;
    run: (api: MediLinkApi, query: string, t: TFunction) => Promise<PaletteItem[]>;
  };
}
