import type {
  FacilitySummary,
  LanguageCode,
  PatientMe,
  PermissionCode,
  RoleCode,
  StaffMe,
} from "../types";

/**
 * Seed data for the MSW mocks. Fictional people and facilities only (no real patient data).
 * Documented in frontend/README.md ("Mock accounts").
 */

/** Password of every seeded mock account (staff min 12, patient min 15 characters). */
export const MOCK_PASSWORD = "MediLink-demo-2026";
/** The only valid authenticator code in the mocks. */
export const MOCK_TOTP_CODE = "123456";
/** One-time recovery code accepted for every enrolled mock staff user. */
export const MOCK_RECOVERY_CODE = "k7q2-m9xd";
/** Token accepted by the mocked password-reset confirm endpoint (uid can be anything). */
export const MOCK_RESET_TOKEN = "mock-reset-token";
/** Any login with this email answers 429 rate_limited (to see the lockout message). */
export const MOCK_RATE_LIMITED_EMAIL = "ratelimited@medilink.test";
/** Failed attempts before the mocks answer 429. */
export const MOCK_MAX_FAILURES = 5;
export const MOCK_RETRY_AFTER_SECONDS = 60;

/** Mirrors backend `authz.catalogue.ROLE_GRANTS` (Sprint 0 seed); features extend it below. */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  facility_admin: [
    "audit.view",
    "billing.approve",
    "billing.record_payment",
    "disputes.handle",
    "disputes.raise",
    "documents.upload",
    "facility.configure",
    "patient.register",
    "patients.merge_request",
    "queue.operate",
    "records.import",
    "reports.view",
    "schedule.manage",
    "schedule.view",
    "staff.manage",
    "subscription.view",
    "visit.reason.view",
  ],
  receptionist: [
    "billing.record_payment",
    "booking.manage",
    "disputes.comment",
    "documents.upload",
    "patient.register",
    "queue.operate",
    "reports.view_own",
    "schedule.view",
    "visit.reason.view",
    "vitals.record",
  ],
  doctor: [
    "clinical.amend_own",
    "clinical.sign",
    "clinical.view",
    "clinical.write",
    "disputes.comment",
    "documents.upload",
    "leave.request",
    "patient.register",
    "prescription.issue",
    "prescription.view",
    "queue.call",
    "records.import_clinical",
    "reports.view_own",
    "visit.reason.view",
    "vitals.record",
  ],
  pharmacist: ["disputes.comment", "pharmacy.dispense", "prescription.view", "reports.view_own"],
};

/**
 * Add a feature's role grants to the mocks (call it at module load in the feature's mock file).
 * Mirrors backend `catalogue.extend()`; already-granted codes are ignored.
 */
export function extendMockRoleGrants(grants: Partial<Record<RoleCode, PermissionCode[]>>): void {
  for (const [role, codes] of Object.entries(grants) as [RoleCode, PermissionCode[]][]) {
    const current = ROLE_PERMISSIONS[role];
    for (const code of codes) if (!current.includes(code)) current.push(code);
  }
}

export const FACILITIES = {
  kigaliClinic: {
    id: "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e01",
    name: "Kigali Clinic",
    slug: "kigali-clinic",
    facility_type: "private_clinic",
  },
  remera: {
    id: "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e02",
    name: "Remera Health Center",
    slug: "remera-health-center",
    facility_type: "health_center",
  },
  nyamirambo: {
    id: "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e03",
    name: "Nyamirambo Polyclinic",
    slug: "nyamirambo-polyclinic",
    facility_type: "polyclinic",
  },
} satisfies Record<string, FacilitySummary>;

export interface MockStaffUser {
  id: string;
  email: string;
  full_name: string;
  preferred_language: LanguageCode;
  is_platform_admin: boolean;
  /** Has a confirmed TOTP device. false → login answers `mfa_setup_required`. */
  mfa_enabled: boolean;
  memberships: { facility: FacilitySummary; roles: RoleCode[] }[];
}

export const STAFF_USERS: MockStaffUser[] = [
  {
    id: "7a1e0b2c-0000-4000-8000-000000000001",
    email: "new.staff@medilink.test",
    full_name: "Uwase Aline",
    preferred_language: "rw",
    is_platform_admin: false,
    mfa_enabled: false,
    memberships: [{ facility: FACILITIES.kigaliClinic, roles: ["receptionist"] }],
  },
  {
    id: "7a1e0b2c-0000-4000-8000-000000000002",
    email: "reception@medilink.test",
    full_name: "Habimana Eric",
    preferred_language: "rw",
    is_platform_admin: false,
    mfa_enabled: true,
    memberships: [{ facility: FACILITIES.kigaliClinic, roles: ["receptionist"] }],
  },
  {
    id: "7a1e0b2c-0000-4000-8000-000000000003",
    email: "doctor@medilink.test",
    full_name: "Uwimana Keza",
    preferred_language: "en",
    is_platform_admin: false,
    mfa_enabled: true,
    memberships: [
      { facility: FACILITIES.kigaliClinic, roles: ["doctor"] },
      { facility: FACILITIES.remera, roles: ["doctor", "facility_admin"] },
      { facility: FACILITIES.nyamirambo, roles: ["doctor"] },
    ],
  },
  {
    id: "7a1e0b2c-0000-4000-8000-000000000004",
    email: "pharmacist@medilink.test",
    full_name: "Nshimiyimana Patrick",
    preferred_language: "fr",
    is_platform_admin: false,
    mfa_enabled: true,
    memberships: [{ facility: FACILITIES.kigaliClinic, roles: ["pharmacist"] }],
  },
  {
    id: "7a1e0b2c-0000-4000-8000-000000000005",
    email: "admin@medilink.test",
    full_name: "Ingabire Grace",
    preferred_language: "en",
    is_platform_admin: true,
    mfa_enabled: true,
    memberships: [],
  },
];

export interface MockPatientRecord {
  me: PatientMe;
  password: string;
}

export const PATIENTS: MockPatientRecord[] = [
  {
    password: MOCK_PASSWORD,
    me: {
      id: "9b2f1c3d-0000-4000-8000-000000000001",
      email: "patient@medilink.test",
      full_name: "Mukamana Jeanne",
      preferred_language: "rw",
      email_verified: false,
      profiles: [
        {
          patient_id: "9b2f1c3d-1111-4000-8000-000000000001",
          display_name: "Mukamana Jeanne",
          relationship: "self",
        },
      ],
    },
  },
];

export function permissionsFor(user: MockStaffUser, facilityId: string | null): PermissionCode[] {
  if (!facilityId) return [];
  const membership = user.memberships.find((m) => m.facility.id === facilityId);
  if (!membership) return [];
  const set = new Set<PermissionCode>();
  for (const role of membership.roles) for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  return [...set];
}

export function toStaffMe(
  user: MockStaffUser,
  activeFacilityId: string | null,
  mfaEnabled: boolean,
): StaffMe {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    preferred_language: user.preferred_language,
    is_platform_admin: user.is_platform_admin,
    mfa_enabled: mfaEnabled,
    memberships: user.memberships.map((m) => ({
      facility: { ...m.facility },
      roles: [...m.roles],
    })),
    active_facility_id: activeFacilityId,
    permissions: permissionsFor(user, activeFacilityId),
  };
}
