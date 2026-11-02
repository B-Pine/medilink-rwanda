import { readPreference, writePreference, type PreferenceKey } from "@medilink/ui";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Device memory for the home page (upgrade 03 §2), through the UI preferences store: the last
 * district and insurer chosen, and the last public facility pages opened. A blocked storage just
 * means nothing is remembered.
 */
const MAX = 5;

export interface RecentPlace {
  slug: string;
  name: string;
}

function parse(raw: string | null): unknown {
  try {
    return JSON.parse(raw ?? "null");
  } catch {
    return null;
  }
}

function isPlace(value: unknown): value is RecentPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Record<string, unknown>;
  return typeof place.slug === "string" && typeof place.name === "string";
}

export function recentPlaces(): RecentPlace[] {
  const value = parse(readPreference("recentPlaces"));
  return Array.isArray(value) ? value.filter(isPlace) : [];
}

export function rememberPlace(place: RecentPlace): void {
  const rest = recentPlaces().filter((p) => p.slug !== place.slug);
  writePreference("recentPlaces", JSON.stringify([place, ...rest].slice(0, MAX)));
}

export interface DiscoveryChoice {
  district?: string;
  insurer?: string;
}

export function savedChoice(): DiscoveryChoice {
  const value = parse(readPreference("discoveryChoice"));
  if (!value || typeof value !== "object") return {};
  const { district, insurer } = value as Record<string, unknown>;
  return {
    district: typeof district === "string" ? district : undefined,
    insurer: typeof insurer === "string" ? insurer : undefined,
  };
}

export function saveChoice(choice: DiscoveryChoice): void {
  writePreference("discoveryChoice", JSON.stringify(choice));
}

const noChanges = () => () => undefined;

/** The stored value after hydration; `null` while the pre-rendered markup hydrates. */
function useStored(key: PreferenceKey): string | null {
  return useSyncExternalStore(
    noChanges,
    () => readPreference(key),
    () => null,
  );
}

export function useRecentPlaces(): RecentPlace[] {
  const raw = useStored("recentPlaces");
  return useMemo(() => {
    const value = parse(raw);
    return Array.isArray(value) ? value.filter(isPlace) : [];
  }, [raw]);
}

export function useSavedChoice(): DiscoveryChoice {
  const raw = useStored("discoveryChoice");
  return useMemo(() => {
    const value = parse(raw);
    if (!value || typeof value !== "object") return {};
    const { district, insurer } = value as Record<string, unknown>;
    return {
      district: typeof district === "string" ? district : undefined,
      insurer: typeof insurer === "string" ? insurer : undefined,
    };
  }, [raw]);
}
