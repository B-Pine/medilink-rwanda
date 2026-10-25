import type {
  ConsentRecord,
  HealthItem,
  Identifier,
  InsuranceProfile,
  MergeRequest,
  RecordClaim,
  Sex,
} from "../../features/patients";
import type { AccessHistoryItem, LinkRelationship } from "../../features/profile";
import { FACILITIES, PATIENTS } from "../data";

/**
 * Synthetic patients shared by the S3 staff and patient mocks (sprint-03 §6.3). Every name,
 * number and document here is invented. Identifier values are kept in plain text in the mock
 * only; responses mask them exactly like the API.
 */

export interface MockIdentifier extends Identifier {
  value: string;
}

export interface MockPatient {
  id: string;
  medilink_number: string;
  full_name: string;
  preferred_name: string | null;
  sex: Sex | null;
  date_of_birth: string | null;
  is_birth_date_estimated: boolean;
  phone_e164: string | null;
  email: string | null;
  address: string | null;
  emergency_contact: { name: string; phone_e164: string; relationship: string } | null;
  no_known_allergies: boolean | null;
  merged_into: string | null;
  version: number;
  identifiers: MockIdentifier[];
  insurance: InsuranceProfile[];
  allergies: HealthItem[];
  conditions: HealthItem[];
  medications: HealthItem[];
  consents: ConsentRecord[];
  history: AccessHistoryItem[];
}

export interface MockFacilityRecord {
  id: string;
  facility_id: string;
  patient_id: string;
  file_number: string | null;
  reception_notes: string | null;
  is_staff_member: boolean;
  is_active: boolean;
  merged_into: string | null;
  version: number;
}

export interface MockLink {
  id: string;
  account_email: string;
  holder_name: string;
  patient_id: string;
  relationship: LinkRelationship;
  granted_by: string | null;
  granted_at: string;
  revoked: boolean;
}

export interface MockInvite {
  id: string;
  code: string;
  patient_id: string;
  relationship: LinkRelationship;
  created_by: string;
  expires_at: string;
  used: boolean;
}

export interface MockClaim extends RecordClaim {
  account_email: string;
  patient_id: string;
  code: string | null;
  attempts: number;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function luhn32(chars: string): string {
  let factor = 2;
  let total = 0;
  for (const char of [...chars].reverse()) {
    const addend = factor * CROCKFORD.indexOf(char);
    factor = factor === 2 ? 1 : 2;
    total += Math.floor(addend / 32) + (addend % 32);
  }
  return CROCKFORD.charAt((32 - (total % 32)) % 32);
}

export function medilinkNumber(seed: number): string {
  const body = Array.from({ length: 7 }, (_, i) => CROCKFORD.charAt((seed * 7 + i * 13) % 32)).join(
    "",
  );
  const raw = body + luhn32(body);
  return `ML-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeMedilinkNumber(value: string): string | null {
  let cleaned = value.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.startsWith("ML"))
    cleaned = "ML" + cleaned.slice(2).replace(/[IL]/g, "1").replace(/O/g, "0");
  if (!/^ML[0-9A-HJKMNP-TV-Z]{8}$/.test(cleaned)) return null;
  const body = cleaned.slice(2);
  if (luhn32(body.slice(0, 7)) !== body[7]) return null;
  return `ML-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Trigram similarity, close enough to pg_trgm for the mocks. */
export function similarity(a: string, b: string): number {
  const grams = (text: string) => {
    const set = new Set<string>();
    for (const word of text.split(" ")) {
      const padded = `  ${word} `;
      for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    }
    return set;
  };
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / (x.size + y.size - shared);
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (digits.startsWith("250")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^7\d{8}$/.test(digits) ? `+250${digits}` : "invalid";
}

export function maskPhone(e164: string | null): string | null {
  if (!e164) return null;
  const local = e164.replace("+250", "");
  return `+250 ${local[0]}•• ••• ${local.slice(-3)}`;
}

export const mask = (last4: string) => `••••${last4}`;

export function ageYears(born: string | null): number | null {
  if (!born) return null;
  const birth = new Date(born);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const before =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (before) age--;
  return age;
}

const NAMES: [string, Sex, string, boolean][] = [
  ["Mukamana Jeanne", "female", "1984-01-01", true],
  ["Jeanne Mukamana", "female", "1984-01-01", true],
  ["Habimana Eric", "male", "1979-06-12", false],
  ["Uwase Aline", "female", "1995-07-07", false],
  ["Niyonsaba Claudine", "female", "1992-03-14", false],
  ["Hakizimana Patrick", "male", "1985-01-01", true],
  ["Mukandayisenga Odette", "female", "1960-01-01", true],
  ["Iradukunda Kevin", "male", "2016-08-20", false],
  ["Uwimana Josiane", "female", "2001-11-05", false],
  ["Ntwari Paul", "male", "1988-02-02", false],
  ["Ishimwe Claude", "male", "1999-09-09", false],
  ["Umutoni Diane", "female", "1990-04-18", false],
  ["Nsengiyumva Jean", "male", "1970-01-01", true],
  ["Mutesi Grace", "female", "2010-12-01", false],
  ["Bizimana Emmanuel", "male", "1982-05-23", false],
  ["Uwamahoro Chantal", "female", "1997-02-28", false],
  ["Gatete Innocent", "male", "1965-01-01", true],
  ["Ingabire Solange", "female", "2019-04-02", false],
  ["Tuyishime Olivier", "male", "2003-10-10", false],
  ["Mukeshimana Agnes", "female", "1958-01-01", true],
  ["Rukundo Samuel", "male", "1994-08-30", false],
  ["Kayitesi Liliane", "female", "1987-07-15", false],
  ["Ndayisaba Fabrice", "male", "2008-03-03", false],
  ["Uwera Vestine", "female", "1975-01-01", true],
  ["Munyaneza Theogene", "male", "1991-11-11", false],
  ["Nyiraneza Esperance", "female", "1968-06-06", false],
];

const now = () => new Date().toISOString();

export interface PatientsStore {
  patients: Map<string, MockPatient>;
  records: MockFacilityRecord[];
  links: MockLink[];
  invites: MockInvite[];
  claims: MockClaim[];
  merges: (MergeRequest & { requested_by_email: string; facility_id: string | null })[];
  /** Tests: approve and undo answer `step_up_required` while true. */
  requireStepUp: boolean;
  nextSeed: number;
}

const ACCOUNT = PATIENTS[0]!.me;
export const SELF_PATIENT_ID = ACCOUNT.profiles[0]!.patient_id;
export const CHILD_PATIENT_ID = "9b2f1c3d-1111-4000-8000-0000000000c1";
export const PARENT_PATIENT_ID = "9b2f1c3d-1111-4000-8000-0000000000d1";
export const MOCK_CLAIM_REFERENCE = "K7Q4PX2M";
export const MOCK_CLAIM_CODE = "246810";

function blankPatient(id: string, seed: number, name: string, sex: Sex, dob: string, est: boolean) {
  const patient: MockPatient = {
    id,
    medilink_number: medilinkNumber(seed),
    full_name: name,
    preferred_name: null,
    sex,
    date_of_birth: dob,
    is_birth_date_estimated: est,
    phone_e164: `+2507881${String(seed).padStart(5, "0")}`,
    email: null,
    address: null,
    emergency_contact: null,
    no_known_allergies: null,
    merged_into: null,
    version: 1,
    identifiers: [],
    insurance: [],
    allergies: [],
    conditions: [],
    medications: [],
    consents: [],
    history: [],
  };
  return patient;
}

export function createPatientsStore(): PatientsStore {
  const store: PatientsStore = {
    patients: new Map(),
    records: [],
    links: [],
    invites: [],
    claims: [],
    merges: [],
    requireStepUp: false,
    nextSeed: 100,
  };
  const kigali = FACILITIES.kigaliClinic.id;
  NAMES.forEach(([name, sex, dob, est], index) => {
    const id = `9b2f1c3d-2222-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const patient = blankPatient(id, index + 1, name, sex, dob, est);
    if (index === 1) patient.phone_e164 = "+250788100001"; // the duplicate pair shares a phone
    if (index === 0) {
      patient.identifiers.push({
        id: crypto.randomUUID(),
        kind: "national_id",
        issuing_country: "RW",
        masked_value: mask("5678"),
        is_verified: true,
        verified_at: now(),
        value: "1198470012345678",
      });
      patient.insurance.push({
        id: crypto.randomUUID(),
        insurer_code: "mutuelle",
        insurer_display: "Mutuelle de Santé",
        member_number: "1234567/01",
        is_principal: true,
        principal_name: null,
        principal_member_number: null,
        relationship_to_principal: null,
        valid_until: "2027-06-30",
        is_expired: false,
        status: "verified",
        status_reason: null,
        last_verified: { facility_name: FACILITIES.kigaliClinic.name, at: now() },
        card_images: { front: null, back: null, can_upload: true },
        is_active: true,
        version: 1,
      });
    }
    if (index === 3) patient.email = "aline@example.test";
    store.patients.set(id, patient);
    if (index < 22) {
      store.records.push({
        id: `5c3d2e1f-3333-4000-8000-${String(index + 1).padStart(12, "0")}`,
        facility_id: index < 20 ? kigali : FACILITIES.remera.id,
        patient_id: id,
        file_number: `KC-${String(index + 1).padStart(4, "0")}`,
        reception_notes: null,
        is_staff_member: index === 2, // Habimana Eric is also staff (reception@medilink.test)
        is_active: true,
        merged_into: null,
        version: 1,
      });
    }
  });
  // open reception claim for Ntwari Paul (index 9)
  const paul = [...store.patients.values()][9]!;
  store.claims.push({
    id: crypto.randomUUID(),
    account_email: "paul@example.test",
    patient_id: paul.id,
    status: "awaiting_reception",
    method: "reception_check",
    contact_hint: null,
    reference: MOCK_CLAIM_REFERENCE,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    code: null,
    attempts: 0,
  });

  // the mock patient account: self, a child (guardian) and a delegated parent
  const email = ACCOUNT.email;
  const self = blankPatient(SELF_PATIENT_ID, 90, ACCOUNT.full_name, "female", "1990-05-01", false);
  self.emergency_contact = {
    name: "Habimana Eric",
    phone_e164: "+250788000111",
    relationship: "spouse",
  };
  self.history.push({
    id: crypto.randomUUID(),
    occurred_at: now(),
    action: "patients.record.viewed",
    actor_kind: "staff",
    actor_role: "receptionist",
    facility: { id: kigali, name: FACILITIES.kigaliClinic.name },
  });
  const child = blankPatient(CHILD_PATIENT_ID, 91, "Keza Uwase", "female", "2019-04-02", false);
  child.phone_e164 = null;
  const parent = blankPatient(
    PARENT_PATIENT_ID,
    92,
    "Mukarugwiza Anne",
    "female",
    "1955-01-01",
    true,
  );
  for (const p of [self, child, parent]) store.patients.set(p.id, p);
  const granted = now();
  store.links.push(
    {
      id: crypto.randomUUID(),
      account_email: email,
      holder_name: ACCOUNT.full_name,
      patient_id: self.id,
      relationship: "self",
      granted_by: null,
      granted_at: granted,
      revoked: false,
    },
    {
      id: crypto.randomUUID(),
      account_email: email,
      holder_name: ACCOUNT.full_name,
      patient_id: child.id,
      relationship: "guardian",
      granted_by: email,
      granted_at: granted,
      revoked: false,
    },
    {
      id: crypto.randomUUID(),
      account_email: email,
      holder_name: ACCOUNT.full_name,
      patient_id: parent.id,
      relationship: "delegate",
      granted_by: "anne@example.test",
      granted_at: granted,
      revoked: false,
    },
    {
      id: crypto.randomUUID(),
      account_email: "anne@example.test",
      holder_name: "Mukarugwiza Anne",
      patient_id: parent.id,
      relationship: "self",
      granted_by: null,
      granted_at: granted,
      revoked: false,
    },
  );
  return store;
}
