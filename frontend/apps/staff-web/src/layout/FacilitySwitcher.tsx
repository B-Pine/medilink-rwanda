import { Buildings, CaretUpDown } from "@phosphor-icons/react";
import type { StaffMe } from "@medilink/api-client";
import {
  Badge,
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
import { facilityTypeLabel } from "../facility/labels";

/**
 * Facility switcher, top-left and always visible for multi-facility staff so they always know
 * where they are acting (design 04 §2). Switching rotates the session server-side and reloads
 * permissions; the user lands on Today of the new facility.
 */
export function FacilitySwitcher({ me }: { me: StaffMe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveFacility = useSetActiveFacility();
  const active = me.memberships.find((m) => m.facility.id === me.active_facility_id)?.facility;

  if (me.memberships.length === 0) {
    return me.is_platform_admin ? <Badge tone="brand">{t("shell.platformAdmin")}</Badge> : null;
  }

  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <Buildings aria-hidden="true" className="size-icon shrink-0 text-fg-muted" />
      <span className="truncate font-semibold">{active?.name ?? t("facility.noFacility")}</span>
    </span>
  );

  if (me.memberships.length === 1) return <div className="min-w-0 text-fg">{label}</div>;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Menu>
        <MenuTrigger
          aria-label={t("facility.switcherLabel", {
            name: active?.name ?? t("facility.noFacility"),
          })}
          className="inline-flex min-h-target max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border-input bg-surface px-3 text-fg hover:bg-subtle"
        >
          {label}
          <CaretUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
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
        <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
          {t("facility.switchFailed")}
        </p>
      )}
    </div>
  );
}
