import type { ErrorSummaryItem } from "../components/ErrorSummary";

/** Shape of a react-hook-form field error (kept structural so ui does not depend on RHF). */
export interface FormFieldError {
  type?: string | number;
  message?: string;
}

/** Errors set from the API's validation_error.fields use this type: their message is already localised. */
export const SERVER_ERROR_TYPE = "server";

/**
 * Message to display for a field error: client-side (zod) messages are i18n keys, server
 * messages are shown as sent (the API localises them with Accept-Language).
 */
export function fieldErrorMessage(
  error: FormFieldError | undefined,
  translate: (key: string) => string,
): string | undefined {
  if (!error?.message) return undefined;
  return error.type === SERVER_ERROR_TYPE ? error.message : translate(error.message);
}

/**
 * Build ErrorSummary items in field order. `fields` maps each form field name to the id of its
 * control (the summary links to it).
 */
export function errorSummaryItems(
  errors: Partial<Record<string, FormFieldError | undefined>>,
  fields: Record<string, string>,
  translate: (key: string) => string,
  formError?: string | null,
): ErrorSummaryItem[] {
  const items: ErrorSummaryItem[] = [];
  if (formError) items.push({ message: formError });
  for (const [name, fieldId] of Object.entries(fields)) {
    const message = fieldErrorMessage(errors[name], translate);
    if (message) items.push({ fieldId, message });
  }
  return items;
}
