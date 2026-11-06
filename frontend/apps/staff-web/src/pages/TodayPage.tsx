import { cx, ImigongoPattern } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { BUILT_PATHS, FEATURE_COMMANDS, FEATURE_TODAY_CARDS } from "../app/features";
import { useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { roleLabel } from "../facility/labels";
import { navLabelKey, navSection, visibleNavItems } from "../layout/navigation";

function kigali(language: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date();
  try {
    return dateFormat(language, { ...options, timeZone: "Africa/Kigali" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "Africa/Kigali" }).format(date);
  }
}

function partOfDay(): "morning" | "afternoon" | "evening" {
  const hour = Number(kigali("en-GB", { hour: "2-digit", hour12: false }));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** Utilities with a home of their own (the bell, Help in the menu): not daily-work shortcuts. */
const NOT_ON_TODAY = new Set(["notifications:inbox", "help:contact"]);

/**
 * Today (design 04 §3): a quiet greeting, the few actions this person takes most as one row of
 * pills, then the cards that need them, led by the live patient flow. No banner competes with
 * the work.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useStaffMe();
  if (!me) return null;

  const language = i18n.resolvedLanguage ?? "en";
  const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);
  const title = t("today.title");
  const actions = FEATURE_COMMANDS()
    .flatMap((provider) => provider.actions?.(me, t) ?? [])
    .filter((action) => !NOT_ON_TODAY.has(action.id));
  // a shortcut that repeats an action (same page or same label) is left out
  const taken = new Set(actions.flatMap((a) => [a.to.split("?")[0], a.label]));
  const shortcuts = visibleNavItems(me, BUILT_PATHS())
    .filter((item) => item.key !== "today" && navSection(item) === "work")
    .filter((item) => !taken.has(item.path) && !taken.has(t(navLabelKey(item))))
    .slice(0, Math.max(0, 5 - actions.length));
  const cards = FEATURE_TODAY_CARDS();

  return (
    <div className="flex flex-col gap-6">
      <header className="relative isolate flex flex-wrap items-end justify-between gap-x-8 gap-y-5 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,var(--color-forest)_0%,var(--color-forest-raised)_100%)] p-6 text-on-forest shadow-raised sm:p-8">
        <ImigongoPattern opacity={0.06} className="-z-10 text-on-forest-accent" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 text-caption font-semibold tracking-wider text-on-forest-muted uppercase">
            {kigali(language, { dateStyle: "full" })}
          </p>
          <PageHeading title={title} className="text-h1 font-bold tracking-tight text-on-forest">
            {t(`today.greeting_${partOfDay()}`, {
              name: me.full_name.split(" ")[0] ?? me.full_name,
            })}
          </PageHeading>
          {membership && (
            <ul
              aria-label={t("today.rolesLabel")}
              className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0"
            >
              {membership.roles.map((role) => (
                <li
                  key={role}
                  className="rounded-full bg-on-forest/12 px-2.5 py-0.5 text-caption font-semibold text-on-forest"
                >
                  {roleLabel(role, t)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {(actions.length > 0 || shortcuts.length > 0) && (
          <nav aria-labelledby="today-actions">
            <h2 id="today-actions" className="sr-only">
              {t("today.quickActions")}
            </h2>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {[
                ...actions.map((a) => ({
                  id: a.id,
                  to: a.to,
                  label: a.label,
                  icon: a.icon,
                  primary: true,
                })),
                ...shortcuts.map((s) => ({
                  id: s.key,
                  to: s.path,
                  label: t(navLabelKey(s)),
                  icon: s.icon,
                  primary: false,
                })),
              ].map(({ id, to, label, icon: ActionIcon, primary }, index) => (
                <li key={id}>
                  <Link
                    to={to}
                    className={cx(
                      "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-body-sm font-semibold no-underline",
                      "transition-[background-color,color,transform] duration-200 ease-out-quint active:scale-[0.97]",
                      primary && index === 0
                        ? "bg-on-forest text-forest hover:bg-on-forest/90"
                        : "bg-on-forest/10 text-on-forest ring-1 ring-on-forest/20 hover:bg-on-forest/20",
                    )}
                  >
                    <ActionIcon
                      aria-hidden="true"
                      weight={primary && index === 0 ? "bold" : "regular"}
                      className="size-4"
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {cards.length > 0 && (
        <div className="ml-stagger grid gap-5 lg:grid-cols-3 [&:empty]:hidden">
          {cards.map((Card, index) => (
            <Card key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
