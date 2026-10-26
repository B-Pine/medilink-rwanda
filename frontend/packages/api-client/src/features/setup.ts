/**
 * S2 facility setup and staff (contract sprint-02 §3): facility profile, hours, calendar,
 * settings, checklist and go-live; catalogue; schedules; billing setup; staff and invitations.
 */
import type { ApiClient } from "../client";
import type { StaffLoginResult, StaffMe, Uuid } from "../types";

export type SetupI18n = { rw: string; en: string; fr: string };
export type SetupList<T> = { results: T[] };
export interface SetupPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---- facility ----------------------------------------------------------------------------------

export interface FacilityProfile {
  id: Uuid;
  name: string;
  slug: string;
  status: string;
  facility_type: string;
  description_i18n: Partial<SetupI18n>;
  phone: string;
  email: string;
  website: string;
  address: string;
  village_code: string;
  latitude: string | null;
  longitude: string | null;
  photos: Uuid[];
  level_of_care: string;
  version: number;
}

export type FacilityProfileUpdate = Partial<
  Pick<
    FacilityProfile,
    | "description_i18n"
    | "phone"
    | "email"
    | "website"
    | "address"
    | "village_code"
    | "latitude"
    | "longitude"
    | "level_of_care"
  >
> & { version: number };

export interface OpeningDay {
  weekday: number;
  opens_at: string;
  closes_at: string;
  break_starts_at?: string | null;
  break_ends_at?: string | null;
}

export interface OpeningHours {
  service_id: Uuid | null;
  days: OpeningDay[];
  version: number;
}

export type CalendarEventKind = "closure" | "holiday_override" | "special_day";

export interface CalendarEvent {
  id: Uuid;
  kind: CalendarEventKind;
  service_id?: Uuid | null;
  starts_at: string;
  ends_at: string;
  is_open?: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  reason?: string;
}

export type CalendarEventInput = Omit<CalendarEvent, "id">;

export interface CalendarDay {
  date: string;
  open: { starts: string; ends: string }[];
  closed_reason: string | null;
  holiday_name: string | null;
  umuganda: boolean;
}

export type SettingsSection = "queue" | "booking" | "billing" | "documents" | "notifications";

export interface SettingFieldSpec {
  kind: "bool" | "int" | "choice" | "text";
  default: boolean | number | string;
  minimum: number | null;
  maximum: number | null;
  choices: string[];
}

export type SettingValues = Record<string, boolean | number | string>;

export interface FacilitySettings extends Record<SettingsSection, SettingValues> {
  umuganda: string;
  version: number;
  schema: Record<SettingsSection, Record<string, SettingFieldSpec>>;
}

export interface Branding {
  letterhead_upload_id: Uuid | null;
  logo_upload_id: Uuid | null;
  stamp_upload_id: Uuid | null;
  footer_text: string;
  version: number;
}

export interface ConfigChange {
  id: Uuid;
  entity: string;
  entity_id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  actor_name: string | null;
  changed_at: string;
}

export type ChecklistCode =
  | "profile"
  | "departments"
  | "services"
  | "service_points"
  | "opening_hours"
  | "staff"
  | "schedules"
  | "tariff"
  | "insurers"
  | "licence";

export interface ChecklistItem {
  code: ChecklistCode;
  done: boolean;
  count: number;
  link: string;
}

export interface SetupChecklist {
  items: ChecklistItem[];
  complete: boolean;
  status: string;
}

// ---- catalogue ---------------------------------------------------------------------------------

export interface Department {
  id: Uuid;
  name_i18n: SetupI18n;
  sort_order?: number;
  is_active?: boolean;
}

export interface Service {
  id: Uuid;
  version: number;
  department_id: Uuid;
  catalogue_item_code?: string;
  name_i18n: SetupI18n;
  duration_minutes?: number;
  is_bookable?: boolean;
  allows_walk_in?: boolean;
  allows_remote_join?: boolean;
  ticket_prefix: string;
  min_age_months?: number | null;
  max_age_months?: number | null;
  sex_restriction?: "female" | "male" | null;
  is_active: boolean;
}

export type ServiceInput = Omit<Service, "id" | "version" | "is_active">;

export type ServicePointKind = "room" | "desk" | "window" | "lab" | "other";

export interface ServicePoint {
  id: Uuid;
  name: string;
  kind: ServicePointKind;
  service_ids?: Uuid[];
  is_active?: boolean;
}

export interface SetupWarning {
  kind: string;
  weekday?: number;
  starts_at?: string;
  ends_at?: string;
  count?: number;
}

// ---- schedules ---------------------------------------------------------------------------------

export interface ScheduleTemplate {
  id: Uuid;
  version: number;
  membership_id: Uuid;
  service_id: Uuid;
  service_point_id?: Uuid | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  slot_minutes: number;
  capacity?: number;
  bookable_share_pct?: number;
  valid_from?: string;
  valid_to: string | null;
}

export type ScheduleTemplateInput = Omit<ScheduleTemplate, "id" | "version" | "valid_to">;

export type ExceptionKind = "leave" | "training" | "extra_session";
export type ExceptionStatus = "requested" | "approved" | "rejected" | "cancelled";

export interface ScheduleException {
  id: Uuid;
  membership_id: Uuid;
  kind: ExceptionKind;
  starts_at: string;
  ends_at: string;
  service_id?: Uuid | null;
  reason?: string;
  status: ExceptionStatus;
  decision_note: string;
  member_name: string;
}

export type ScheduleExceptionInput = Pick<
  ScheduleException,
  "membership_id" | "kind" | "starts_at" | "ends_at" | "service_id" | "reason"
>;

export interface ScheduleBlock {
  membership_id: Uuid;
  template_id: Uuid | null;
  service_id: Uuid;
  service_point_id: Uuid | null;
  starts_at: string;
  ends_at: string;
  slot_minutes: number | null;
  capacity: number;
  bookable_share_pct: number;
}

export interface ScheduleOverview {
  members: {
    membership_id: Uuid;
    full_name: string;
    blocks: ScheduleBlock[];
    exceptions: ScheduleException[];
  }[];
}

// ---- billing setup -----------------------------------------------------------------------------

export type TariffKind = "service" | "procedure" | "medicine" | "other";

export interface Tariff {
  id: Uuid;
  version: number;
  code: string;
  name_i18n: SetupI18n;
  kind: TariffKind;
  service_id?: Uuid | null;
  amount_rwf: number;
  valid_from?: string;
  valid_to: string | null;
}

export type TariffInput = Omit<Tariff, "id" | "version" | "valid_to">;

export interface InsurerRule {
  id: Uuid;
  version: number;
  insurer_code: string;
  applies_to_all_services: boolean;
  service_ids: Uuid[];
  /** Patient share in basis points (10 000 = 100 %). */
  patient_share_bp: number;
  requires_referral: boolean;
  excluded_tariff_codes: string[];
  ceiling_per_visit_rwf: number | null;
  valid_from?: string;
  valid_to: string | null;
}

export type InsurerRuleInput = Omit<InsurerRule, "id" | "version" | "valid_to">;

export interface Versioned<T> {
  previous: T;
  current: T;
}

// ---- staff -------------------------------------------------------------------------------------

export interface StaffRole {
  code: string;
  name: string;
  permissions: string[];
}

export type Council = "rmdc" | "ncnm" | "npc" | "other";

export interface StaffMembership {
  id: Uuid;
  user_id: Uuid;
  full_name: string;
  email: string;
  roles: string[];
  service_points: Uuid[];
  is_active: boolean;
  mfa_enabled: boolean;
  clinician: {
    council: string;
    licence_number: string;
    specialty: string;
    attested_at: string | null;
  } | null;
  joined_at: string;
  deactivation_reason: string;
  version: number;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: Uuid;
  email: string;
  role_codes: string[];
  service_point_ids: Uuid[];
  status: InvitationStatus;
  expires_at: string;
  invited_by: string | null;
  created_at: string;
}

export interface ClinicianProfile {
  council: Council;
  licence_number: string;
  specialty?: string;
}

export interface InvitationLookup {
  facility_name: string;
  invited_by: string | null;
  role_codes: string[];
  email_masked: string;
  account_exists: boolean;
  expires_at: string;
}

// ---- client ------------------------------------------------------------------------------------

const S = "/api/v1/staff";
export const setupPaths = {
  facility: `${S}/facility/`,
  photos: `${S}/facility/photos/`,
  photo: (id: Uuid) => `${S}/facility/photos/${id}/`,
  hours: `${S}/facility/opening-hours/`,
  events: `${S}/facility/calendar-events/`,
  event: (id: Uuid) => `${S}/facility/calendar-events/${id}/`,
  calendar: `${S}/facility/calendar/`,
  settings: `${S}/facility/settings/`,
  branding: `${S}/facility/branding/`,
  changes: `${S}/facility/config-changes/`,
  checklist: `${S}/facility/setup-checklist/`,
  goLive: `${S}/facility/go-live/`,
  departments: `${S}/departments/`,
  department: (id: Uuid) => `${S}/departments/${id}/`,
  services: `${S}/services/`,
  service: (id: Uuid) => `${S}/services/${id}/`,
  points: `${S}/service-points/`,
  point: (id: Uuid) => `${S}/service-points/${id}/`,
  templates: `${S}/schedule-templates/`,
  template: (id: Uuid) => `${S}/schedule-templates/${id}/`,
  exceptions: `${S}/schedule-exceptions/`,
  exception: (id: Uuid, action: "approve" | "reject" | "cancel") =>
    `${S}/schedule-exceptions/${id}/${action}/`,
  overview: `${S}/schedule-overview/`,
  tariffs: `${S}/tariff-items/`,
  tariff: (id: Uuid) => `${S}/tariff-items/${id}/`,
  tariffHistory: (code: string) => `${S}/tariff-items/${encodeURIComponent(code)}/history/`,
  insurerRules: `${S}/insurer-rules/`,
  insurerRule: (id: Uuid) => `${S}/insurer-rules/${id}/`,
  roles: `${S}/roles/`,
  memberships: `${S}/memberships/`,
  membership: (id: Uuid) => `${S}/memberships/${id}/`,
  membershipAction: (
    id: Uuid,
    action: "deactivate" | "reactivate" | "attest-licence" | "mfa-reset",
  ) => `${S}/memberships/${id}/${action}/`,
  invitations: `${S}/invitations/`,
  invitation: (id: Uuid, action: "resend" | "revoke") => `${S}/invitations/${id}/${action}/`,
  clinician: `${S}/clinician-profile/`,
  invitationLookup: `${S}/auth/invitations/lookup/`,
  invitationAccept: `${S}/auth/invitations/accept/`,
  platformMfaReset: (id: Uuid) => `/api/v1/platform/memberships/${id}/mfa-reset/`,
};

const query = (params: Record<string, string | number | undefined | null>) => {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null,
  );
  return entries.length
    ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
    : "";
};
const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

export function createSetupApi(client: ApiClient) {
  const patch = <T>(path: string, body: unknown) => client.request<T>("PATCH", path, { body });
  const put = <T>(path: string, body: unknown) => client.request<T>("PUT", path, { body });
  const del = (path: string) => client.request<void>("DELETE", path);
  return {
    // F1–F13
    facility: () => client.get<FacilityProfile>(setupPaths.facility),
    updateFacility: (body: FacilityProfileUpdate) =>
      patch<FacilityProfile>(setupPaths.facility, body),
    addPhoto: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return client.post<FacilityProfile>(setupPaths.photos, form);
    },
    removePhoto: (uploadId: Uuid) => del(setupPaths.photo(uploadId)),
    hours: (serviceId?: Uuid | null) =>
      client.get<OpeningHours>(`${setupPaths.hours}${query({ service_id: serviceId })}`),
    saveHours: (body: { service_id?: Uuid | null; version: number; days: OpeningDay[] }) =>
      put<OpeningHours>(setupPaths.hours, body),
    events: (from?: string, to?: string) =>
      client.get<SetupList<CalendarEvent>>(`${setupPaths.events}${query({ from, to })}`),
    addEvent: (body: CalendarEventInput) => client.post<CalendarEvent>(setupPaths.events, body),
    updateEvent: (id: Uuid, body: Partial<CalendarEventInput>) =>
      patch<CalendarEvent>(setupPaths.event(id), body),
    removeEvent: (id: Uuid) => del(setupPaths.event(id)),
    calendar: (params: { from: string; to: string; service_id?: Uuid | null }) =>
      client.get<{ days: CalendarDay[] }>(`${setupPaths.calendar}${query(params)}`),
    settings: () => client.get<FacilitySettings>(setupPaths.settings),
    updateSettings: (body: {
      version: number;
      section: SettingsSection | "umuganda";
      values: SettingValues;
    }) => patch<FacilitySettings>(setupPaths.settings, body),
    branding: () => client.get<Branding>(setupPaths.branding),
    saveBranding: (body: Partial<Omit<Branding, "version">> & { version: number }) =>
      put<Branding>(setupPaths.branding, body),
    changes: (params: { entity?: string; page?: number } = {}) =>
      client.get<SetupPage<ConfigChange>>(`${setupPaths.changes}${query(params)}`),
    checklist: () => client.get<SetupChecklist>(setupPaths.checklist),
    goLive: (version: number, idempotencyKey?: string) =>
      client.post<FacilityProfile>(setupPaths.goLive, { version }, idem(idempotencyKey)),
    // C1–C6
    departments: () => client.get<SetupList<Department>>(setupPaths.departments),
    addDepartment: (body: Omit<Department, "id">) =>
      client.post<Department>(setupPaths.departments, body),
    updateDepartment: (id: Uuid, body: Partial<Omit<Department, "id">>) =>
      patch<Department>(setupPaths.department(id), body),
    services: () => client.get<SetupList<Service>>(setupPaths.services),
    addService: (body: ServiceInput) =>
      client.post<{ service: Service; warnings: SetupWarning[] }>(setupPaths.services, body),
    updateService: (
      id: Uuid,
      body: Partial<ServiceInput> & { version: number; is_active?: boolean },
    ) => patch<{ service: Service; warnings: SetupWarning[] }>(setupPaths.service(id), body),
    points: () => client.get<SetupList<ServicePoint>>(setupPaths.points),
    addPoint: (body: Omit<ServicePoint, "id">) =>
      client.post<ServicePoint>(setupPaths.points, body),
    updatePoint: (id: Uuid, body: Partial<Omit<ServicePoint, "id">>) =>
      patch<ServicePoint>(setupPaths.point(id), body),
    // S1–S7
    templates: (params: { membership_id?: Uuid; service_id?: Uuid } = {}) =>
      client.get<SetupList<ScheduleTemplate>>(`${setupPaths.templates}${query(params)}`),
    addTemplate: (body: ScheduleTemplateInput) =>
      client.post<{ template: ScheduleTemplate; warnings: SetupWarning[] }>(
        setupPaths.templates,
        body,
      ),
    updateTemplate: (id: Uuid, body: Partial<ScheduleTemplateInput> & { version: number }) =>
      patch<{ template: ScheduleTemplate; warnings: SetupWarning[] }>(
        setupPaths.template(id),
        body,
      ),
    endTemplate: (id: Uuid) => del(setupPaths.template(id)),
    exceptions: (
      params: { status?: ExceptionStatus; membership_id?: Uuid; from?: string; to?: string } = {},
    ) => client.get<SetupList<ScheduleException>>(`${setupPaths.exceptions}${query(params)}`),
    addException: (body: ScheduleExceptionInput) =>
      client.post<{ exception: ScheduleException; warnings: SetupWarning[] }>(
        setupPaths.exceptions,
        body,
      ),
    decideException: (id: Uuid, action: "approve" | "reject" | "cancel", decision_note = "") =>
      client.post<ScheduleException>(setupPaths.exception(id, action), { decision_note }),
    overview: (from: string, to: string) =>
      client.get<ScheduleOverview>(`${setupPaths.overview}${query({ from, to })}`),
    // B1–B5
    tariffs: (on?: string) =>
      client.get<SetupList<Tariff>>(`${setupPaths.tariffs}${query({ on })}`),
    addTariff: (body: TariffInput) => client.post<Tariff>(setupPaths.tariffs, body),
    changeTariff: (
      id: Uuid,
      body: { version: number; amount_rwf?: number; name_i18n?: SetupI18n; valid_from?: string },
    ) => patch<Versioned<Tariff>>(setupPaths.tariff(id), body),
    tariffHistory: (code: string) => client.get<SetupList<Tariff>>(setupPaths.tariffHistory(code)),
    insurerRules: () => client.get<SetupList<InsurerRule>>(setupPaths.insurerRules),
    addInsurerRule: (body: InsurerRuleInput) =>
      client.post<InsurerRule>(setupPaths.insurerRules, body),
    changeInsurerRule: (id: Uuid, body: Partial<InsurerRuleInput> & { version: number }) =>
      patch<Versioned<InsurerRule>>(setupPaths.insurerRule(id), body),
    // T1–T10, P1–P2, PL1
    roles: () => client.get<SetupList<StaffRole>>(setupPaths.roles),
    memberships: (params: { status?: "active" | "deactivated"; role?: string; q?: string } = {}) =>
      client.get<SetupList<StaffMembership>>(`${setupPaths.memberships}${query(params)}`),
    membership: (id: Uuid) => client.get<StaffMembership>(setupPaths.membership(id)),
    updateMembership: (
      id: Uuid,
      body: { version: number; role_codes?: string[]; service_point_ids?: Uuid[] },
    ) => patch<StaffMembership>(setupPaths.membership(id), body),
    membershipAction: (
      id: Uuid,
      action: "deactivate" | "reactivate" | "attest-licence" | "mfa-reset",
      reason?: string,
    ) =>
      client.post<StaffMembership>(
        setupPaths.membershipAction(id, action),
        reason === undefined ? {} : { reason },
      ),
    invitations: () => client.get<SetupList<Invitation>>(setupPaths.invitations),
    invite: (
      body: { email: string; role_codes: string[]; service_point_ids?: Uuid[] },
      idempotencyKey?: string,
    ) => client.post<Invitation>(setupPaths.invitations, body, idem(idempotencyKey)),
    invitationAction: (id: Uuid, action: "resend" | "revoke") =>
      client.post<Invitation>(setupPaths.invitation(id, action), {}),
    clinicianProfile: () => client.get<ClinicianProfile>(setupPaths.clinician),
    updateClinicianProfile: (body: Partial<ClinicianProfile>) =>
      patch<ClinicianProfile>(setupPaths.clinician, body),
    lookupInvitation: (token: string) =>
      client.post<InvitationLookup>(setupPaths.invitationLookup, { token }),
    acceptInvitation: (body: { token: string; full_name?: string; password?: string }) =>
      client.post<StaffLoginResult | StaffMe>(setupPaths.invitationAccept, body),
    platformMfaReset: (membershipId: Uuid) =>
      client.post<void>(setupPaths.platformMfaReset(membershipId), {}),
  };
}

export type SetupApi = ReturnType<typeof createSetupApi>;
