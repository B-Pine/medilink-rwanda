import type { FacilityType, RoleCode } from "@medilink/api-client";
import type { TFunction } from "i18next";

const KNOWN_TYPES = new Set([
  "health_post",
  "health_center",
  "district_hospital",
  "provincial_hospital",
  "referral_hospital",
  "private_clinic",
  "polyclinic",
  "private_hospital",
  "dental_clinic",
  "eye_clinic",
  "diagnostic_center",
]);

export function facilityTypeLabel(type: FacilityType, t: TFunction): string {
  return t(`facility.types.${KNOWN_TYPES.has(type) ? type : "other"}`);
}

export function roleLabel(role: RoleCode, t: TFunction): string {
  return t(`facility.roles.${role}`, { defaultValue: role });
}
