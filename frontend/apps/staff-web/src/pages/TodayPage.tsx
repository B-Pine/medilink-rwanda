import { ImigongoPattern } from "@medilink/ui";
import { CaretRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { FEATURE_COMMANDS, FEATURE_TODAY_CARDS } from "../app/features";
import { useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";
import { roleLabel } from "../facility/labels";
import { navLabelKey, visibleNavItems } from "../layout/navigation";

function kigali(language: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date();
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: "Africa/Kigali" }).format(
      date,
    );
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "Africa/Kigali" }).format(date);
  }
}

function partOfDay(): "morning" | "afternoon" | "evening" {
  const hour = Number(kigali("en-GB", { hour: "2-digit", hour12: false }));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/**
 * Today (design 04 §3): who and where you are, the actions you take most, then the cards that
 * need a decision (queue, setup, leave) from the feature Today cards.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useStaffMe();
  if (!me) return null;

  const language = i18n.resolvedLanguage ?? "en";
  const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);
  const title = t("today.title");
  const actions = FEATURE_COMMANDS().flatMap((provider) => provider.actions?.(me, t) ?? []);
  const shortcuts = visibleNavItems(me)
    .filter((item) => item.key !== "today")
    .slice(0, Math.max(0, 6 - actions.length));
  const cards = FEATURE_TODAY_CARDS();

  return (
    <div className="flex flex-col gap-6">
      <section className="relative isolate overflow-hidden rounded-lg bg-forest px-6 py-6 text-on-forest sm:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 -z-10 w-2/3 text-on-forest-accent"
          style={{ maskImage: "linear-gradient(to left, black, transparent)" }}
        >
          <ImigongoPattern opacity={0.1} />
        </div>
        <p className="m-0 text-body-sm text-on-forest-muted">
          {kigali(language, { dateStyle: "full" })}
        </p>
        <PageHeading title={title} className="mt-1 font-heading text-h1 text-on-forest">
          {t(`today.greeting_${partOfDay()}`, { name: me.full_name.split(" ")[0] ?? me.full_name })}
        </PageHeading>
        <p className="m-0 mt-2 max-w-2xl text-on-forest-muted">
          {membership
            ? t("today.facility", { facility: membership.facility.name })
            : t("today.platform")}
        </p>
        {membership && (
          <ul
            aria-label={t("today.rolesLabel")}
            className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0"
          >
            {membership.roles.map((role) => (
              <li
                key={role}
                className="rounded-full bg-forest-raised px-3 py-0.5 text-body-sm font-semibold text-on-forest"
              >
                {roleLabel(role, t)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(actions.length > 0 || shortcuts.length > 0) && (
        <section aria-labelledby="today-actions" className="flex flex-col gap-3">
          <h2 id="today-actions" className="m-0 font-heading text-h3">
            {t("today.quickActions")}
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-6">
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
            ].map(({ id, to, label, icon: ActionIcon, primary }) => (
              <li key={id} className="flex">
                <Link
                  to={to}
                  className={
                    primary
                      ? "group flex flex-1 flex-col gap-3 rounded-lg bg-primary p-4 text-on-primary no-underline hover:bg-primary-hover"
                      : "group flex flex-1 flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-fg no-underline hover:border-border-input hover:bg-raised"
                  }
                >
                  <ActionIcon aria-hidden="true" weight="duotone" className="size-7" />
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {label}
                    <CaretRight
                      aria-hidden="true"
                      className="size-4 opacity-60 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cards.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3 [&:empty]:hidden">
          {cards.map((Card, index) => (
            <Card key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
