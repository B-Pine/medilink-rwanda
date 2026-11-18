import { CaretUpDown } from "@phosphor-icons/react";
import type { StaffMe } from "@medilink/api-client";
import {
  cx,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { HOME_PATH } from "../auth/destination";
import { useSetActiveFacility } from "../auth/queries";
import { facilityTypeLabel, roleLabel } from "../facility/labels";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!)
    .join("")
    .toUpperCase();
}

/**
 * The workspace card at the top of the sidebar (design 04 §2, staff clean-up 2026-11-16): where
 * the person is acting and as whom. For staff of more than one facility the card is the facility
 * switcher; switching rotates the session server-side and lands on Today of the new facility.
 * Collapsed, only the initials tile shows.
 */
export function FacilitySwitcher({ me, collapsed = false }: { me: StaffMe; collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveFacility = useSetActiveFacility();
  const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);
  const name =
    membership?.facility.name ??
    (me.is_platform_admin ? t("shell.platformAdmin") : t("facility.noFacility"));
  const detail = membership
    ? membership.roles.map((role) => roleLabel(role, t)).join(" · ")
    : me.memberships.length > 0
      ? t("facility.noFacility")
      : null;
  const switchable = me.memberships.length > 1;

  const body = (
    <>
      {membership?.facility.logo_url ? (
        // the facility's own logo; the initials tile without one
        <img
          src={membership.facility.logo_url}
          alt=""
          className="size-9 shrink-0 rounded-xl bg-surface object-contain ring-1 ring-border/70"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-heading text-body-sm font-bold text-on-primary"
        >
          {initialsOf(name)}
        </span>
      )}
      <span className={cx("flex min-w-0 flex-1 flex-col text-left", collapsed && "lg:sr-only")}>
        <span className="truncate text-body-sm font-semibold text-fg">{name}</span>
        {detail && <span className="truncate text-caption text-fg-muted">{detail}</span>}
      </span>
    </>
  );
  const shape = cx(
    "flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-page px-2.5 py-2",
    collapsed && "lg:justify-center lg:border-transparent lg:bg-transparent lg:px-0",
  );

  if (!switchable) return <div className={shape}>{body}</div>;

  return (
    <div className="flex flex-col gap-1">
      <Menu>
        <MenuTrigger
          aria-label={t("facility.switcherLabel", { name })}
          title={collapsed ? name : undefined}
          className={cx(
            shape,
            "cursor-pointer transition-[background-color,border-color] duration-150 ease-out-quint hover:border-border-input hover:bg-subtle",
          )}
        >
          {body}
          <CaretUpDown
            aria-hidden="true"
            className={cx("size-4 shrink-0 text-fg-muted", collapsed && "lg:hidden")}
          />
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>{t("facility.switchHeading")}</MenuLabel>
          <MenuRadioGroup
            value={me.active_facility_id ?? ""}
            onValueChange={(facilityId) => {
              if (facilityId === me.active_facility_id) return;
              setActiveFacility.mutate(facilityId, { onSuccess: () => void navigate(HOME_PATH) });
            }}
          >
            {me.memberships.map(({ facility }) => (
              <MenuRadioItem key={facility.id} value={facility.id}>
                <span className="flex flex-col">
                  <span className="font-semibold">{facility.name}</span>
                  <span className="text-body-sm text-fg-muted">
                    {facilityTypeLabel(facility.facility_type, t)}
                  </span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      {setActiveFacility.isError && (
        <p role="alert" className="m-0 px-1 text-body-sm font-semibold text-danger">
          {t("facility.switchFailed")}
        </p>
      )}
    </div>
  );
}
