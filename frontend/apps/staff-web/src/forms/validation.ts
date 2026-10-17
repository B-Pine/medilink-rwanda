/** Pragmatic email check (the API validates for real). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Authenticator codes may be pasted with spaces or a dash ("123 456"). */
export function normaliseOtp(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export const OTP_PATTERN = /^\d{6}$/;
