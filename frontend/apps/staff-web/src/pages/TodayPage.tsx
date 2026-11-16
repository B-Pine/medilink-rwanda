import { buttonClassName, Menu, MenuContent, MenuItem, MenuTrigger } from "@medilink/ui";
import { DotsThree } from "@phosphor-icons/react";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { BUILT_PATHS, FEATURE_COMMANDS, FEATURE_TODAY_CARDS } from "../app/features";
import { visibleNavItems } from "../layout/navigation";
import { useStaffMe } from "../auth/queries";
import { PageHeading } from "../components/PageHeading";

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

/** Actions in view on Today; the others are under "More". */
const MAX_VISIBLE_ACTIONS = 3;

/**
 * Today (design 04 §3; dashboards #262): a quiet header (date, greeting, roles) with the three
 * actions this person takes most and the rest under "More", then the cards that need them, led by
 * the live patient flow. No banner competes with the work.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useStaffMe();
  if (!me) return null;

  const language = i18n.resolvedLanguage ?? "en";
  const title = t("today.title");
  // a plain page link is already in the sidebar; the header keeps actions (a walk-in, a phone
  // booking, a call), so "Pharmacy" no longer sits above "Open the pharmacy queue"
  const pages = new Set(visibleNavItems(me, BUILT_PATHS()).map((item) => item.path));
  const actions = FEATURE_COMMANDS()
    .flatMap((provider) => provider.actions?.(me, t) ?? [])
    .filter((action) => !NOT_ON_TODAY.has(action.id) && !pages.has(action.to));
  // the header holds actions only: pages are in the sidebar and each card opens its own page, so
  // a "Laboratory" button above "Open the lab" was the same link twice (audit 2026-11-16)
  const cards = FEATURE_TODAY_CARDS();

  const quick = actions.map((a) => ({ id: a.id, to: a.to, label: a.label, icon: a.icon }));
  // one primary and two secondary actions in view; the rest in "More" (the facility admin had 12)
  const shown = quick.slice(0, MAX_VISIBLE_ACTIONS);
  const more = quick.slice(MAX_VISIBLE_ACTIONS);

  return (
    <div className="flex flex-col gap-6">
      {/* a calm header: date and greeting; at most three actions, the rest under "⋯" */}
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-border/70 pb-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-caption font-semibold tracking-wider text-fg-muted uppercase">
            {kigali(language, { dateStyle: "full" })}
          </p>
          <PageHeading title={title} className="text-h1 font-bold tracking-tight text-fg">
            {t(`today.greeting_${partOfDay()}`, {
              name: me.full_name.split(" ")[0] ?? me.full_name,
            })}
          </PageHeading>
        </div>

        {quick.length > 0 && (
          <nav aria-labelledby="today-actions" className="flex flex-wrap items-center gap-2">
            <h2 id="today-actions" className="sr-only">
              {t("today.quickActions")}
            </h2>
            {shown.map(({ id, to, label, icon: ActionIcon }, index) => (
              <Link
                key={id}
                to={to}
                className={buttonClassName({
                  variant: index === 0 ? "primary" : "secondary",
                  size: "sm",
                })}
              >
                <ActionIcon aria-hidden="true" weight="bold" className="size-4" />
                {label}
              </Link>
            ))}
            {more.length > 0 && (
              <Menu>
                <MenuTrigger
                  aria-label={t("today.moreActions", { count: more.length })}
                  title={t("today.moreActions", { count: more.length })}
                  className={buttonClassName({
                    variant: "secondary",
                    size: "sm",
                    className: "px-2",
                  })}
                >
                  <DotsThree aria-hidden="true" weight="bold" className="size-5" />
                </MenuTrigger>
                <MenuContent align="end">
                  {more.map(({ id, to, label, icon: ActionIcon }) => (
                    <MenuItem key={id} onSelect={() => void navigate(to)}>
                      <ActionIcon aria-hidden="true" className="size-5 text-fg-muted" />
                      {label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
          </nav>
        )}
      </header>

      {cards.length > 0 && (
        <div className="ml-stagger grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3 [&:empty]:hidden">
          {cards.map((Card, index) => (
            <Card key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
