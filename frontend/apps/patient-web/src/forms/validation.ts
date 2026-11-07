/** Pragmatic email check (the API validates for real). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Patients: at least 8 characters (decision 2026-11-05), no composition rules (security 03 §2, contract B6). */
export const PATIENT_PASSWORD_MIN = 8;

/** Versions of the documents accepted at sign-up (ConsentRecord.version). */
export const TERMS_VERSION = "2026-10";
export const PRIVACY_VERSION = "2026-10";
