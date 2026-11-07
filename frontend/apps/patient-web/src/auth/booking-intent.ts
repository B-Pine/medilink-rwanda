import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DASHBOARD } from "../app/paths";
import { useApi } from "../app/services";
import { pick } from "../features/booking/discovery";

/** `/dashboard/book/<slug>?service=<id>&today=1` → its parts; null for any other address. */
export function parseBookingPath(
  from: string | undefined,
): { slug: string; service: string | null; join: boolean } | null {
  if (!from) return null;
  try {
    const url = new URL(from, "https://medilink.invalid");
    const match = new RegExp(`^(?:${DASHBOARD})?/book/([^/]+)/?$`).exec(url.pathname);
    if (!match?.[1]) return null;
    return {
      slug: decodeURIComponent(match[1]),
      service: url.searchParams.get("service"),
      join: url.searchParams.get("today") === "1",
    };
  } catch {
    // a malformed address (bad % escape): no context line, sign-in still works
    return null;
  }
}

/**
 * What a signed-out visitor was doing when sign-in interrupted them ("Sign in to book General
 * consultation at Kigali Clinic"), from the address they will return to. Names come from the
 * public facility profile, usually already cached by the page they came from.
 */
export function useBookingIntent(from: string | undefined): string | null {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const booking = parseBookingPath(from);
  const profile = useQuery({
    queryKey: ["discovery", "facility", booking?.slug ?? ""],
    queryFn: () => api.booking.facility(booking!.slug),
    enabled: booking !== null,
    staleTime: 60_000,
  });
  if (!booking) return null;
  const facility = profile.data?.name;
  if (!facility) return booking.join ? t("login.intent.joinAny") : t("login.intent.bookAny");
  const found = profile.data?.services.find((s) => s.id === booking.service);
  const service = found ? pick(found.name_i18n, lang) : "";
  if (booking.join)
    return service
      ? t("login.intent.join", { service, facility })
      : t("login.intent.joinAt", { facility });
  return service
    ? t("login.intent.book", { service, facility })
    : t("login.intent.bookAt", { facility });
}
