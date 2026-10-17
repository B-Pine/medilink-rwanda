/** Pragmatic email check (the API validates for real). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Patients: at least 15 characters, no composition rules (security 03 §2, contract B6). */
export const PATIENT_PASSWORD_MIN = 15;

/** Versions of the documents accepted at sign-up (ConsentRecord.version). */
export const TERMS_VERSION = "2026-10";
export const PRIVACY_VERSION = "2026-10";
