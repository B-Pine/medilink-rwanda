import type { LanguageCode } from "../../types";
import type { MockContext } from "../handlers";

/** Messages the S1 mocks return (localised like the real API; Kinyarwanda is mock data only). */
const S1_MESSAGES = {
  stepUpRequired: {
    en: "Please confirm it's you to continue.",
    fr: "Confirmez votre identité pour continuer.",
    rw: "Emeza ko ari wowe kugira ngo ukomeze.",
  },
  wrongPin: { en: "That PIN is not correct.", fr: "Ce code PIN est incorrect.", rw: "PIN si yo." },
  wrongPassword: {
    en: "That password is not correct.",
    fr: "Ce mot de passe est incorrect.",
    rw: "Ijambo ry'ibanga si ryo.",
  },
  pinUnavailable: {
    en: "PIN unlock isn't available. Use your password.",
    fr: "Le déverrouillage par PIN n'est pas disponible. Utilisez votre mot de passe.",
    rw: "Gufungura ukoresheje PIN ntibishoboka. Koresha ijambo ry'ibanga.",
  },
  pinFormat: {
    en: "Use 4 to 6 digits.",
    fr: "Utilisez 4 à 6 chiffres.",
    rw: "Koresha imibare 4 kugeza kuri 6.",
  },
  pinTooSimple: {
    en: "This PIN is too easy to guess. Avoid repeated digits and sequences.",
    fr: "Ce code PIN est trop facile à deviner.",
    rw: "Iyi PIN iroroshye cyane gukekwa.",
  },
  stepUpFailed: {
    en: "We couldn't confirm it's you. Check your password and code.",
    fr: "Nous n'avons pas pu confirmer votre identité.",
    rw: "Ntitwashoboye kwemeza ko ari wowe.",
  },
  fileType: {
    en: "This file type isn't accepted. Upload a PDF, JPEG, PNG or HEIC file.",
    fr: "Ce type de fichier n'est pas accepté. Envoyez un PDF, JPEG, PNG ou HEIC.",
    rw: "Ubu bwoko bwa dosiye ntibwemewe.",
  },
  fileSize: {
    en: "This file is too large.",
    fr: "Ce fichier est trop volumineux.",
    rw: "Iyi dosiye ni nini cyane.",
  },
  notClean: {
    en: "This file can't be opened until its security check has finished.",
    fr: "Ce fichier ne peut pas être ouvert avant la fin de la vérification.",
    rw: "Iyi dosiye ntishobora gufungurwa itaragenzurwa.",
  },
  conflict: {
    en: "This conflicts with the current state. Reload and try again.",
    fr: "Conflit avec l'état actuel. Rechargez et réessayez.",
    rw: "Hari impinduka zabaye. Ongera ufungure.",
  },
  notAllowed: {
    en: "This action is not allowed.",
    fr: "Cette action n'est pas autorisée.",
    rw: "Ntibyemewe.",
  },
  permissionDenied: {
    en: "You don't have permission to do this.",
    fr: "Vous n'avez pas l'autorisation de faire ceci.",
    rw: "Nta burenganzira ufite bwo gukora ibi.",
  },
  notEditable: {
    en: "This application can't be changed in its current status.",
    fr: "Cette demande ne peut pas être modifiée dans son état actuel.",
    rw: "Ubu busabe ntibushobora guhindurwa ubu.",
  },
  invalidLink: {
    en: "This link is invalid or has expired. Ask for a new link.",
    fr: "Ce lien est invalide ou a expiré. Demandez un nouveau lien.",
    rw: "Iyi link ntikora cyangwa yarashaje. Saba indi.",
  },
  required: { en: "This is required.", fr: "Obligatoire.", rw: "Birakenewe." },
  notScanned: {
    en: "Some documents are still being checked. Try again in a moment.",
    fr: "Certains documents sont encore en vérification.",
    rw: "Hari inyandiko zikigenzurwa.",
  },
  goLiveFailed: {
    en: "The facility isn't ready to go live.",
    fr: "L'établissement n'est pas prêt à être mis en ligne.",
    rw: "Ikigo ntikiriteguye gutangira.",
  },
  mohLicenceCheck: {
    en: "A current MoH operating licence that hasn't expired is required.",
    fr: "Une licence d'exploitation du MINISANTE en cours de validité est requise.",
    rw: "Hakenewe uruhushya rwa MINISANTE rutararangira.",
  },
  importNotReady: {
    en: "Only a previewed import without errors can be applied.",
    fr: "Seul un import prévisualisé sans erreurs peut être appliqué.",
    rw: "Iyinjizwa ritagenzuwe ntirishobora gukoreshwa.",
  },
} as const;

export type S1MessageKey = keyof typeof S1_MESSAGES;

export function s1(key: S1MessageKey, lang: LanguageCode): string {
  return S1_MESSAGES[key][lang];
}

/** 403 `step_up_required` unless the mock session authenticated recently. */
export function stepUpFailure(context: MockContext, lang: LanguageCode): Response | null {
  return context.hasRecentAuth()
    ? null
    : context.errorResponse(403, "step_up_required", s1("stepUpRequired", lang));
}

export function fieldError(
  context: MockContext,
  lang: LanguageCode,
  fields: Record<string, string>,
): Response {
  const resolved = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, [v]]));
  return context.errorResponse(400, "validation_error", context.message("validation", lang), {
    fields: resolved,
  });
}

export function rule(context: MockContext, lang: LanguageCode, key: S1MessageKey = "notAllowed") {
  return context.errorResponse(422, "business_rule_violation", s1(key, lang));
}

export function conflict(context: MockContext, lang: LanguageCode) {
  return context.errorResponse(409, "conflict", s1("conflict", lang));
}

/** Platform endpoints: full staff session with `is_platform_admin`, else 401/403. */
export function platformAdmin(context: MockContext, lang: LanguageCode) {
  const result = context.authenticatedStaff(lang);
  if ("error" in result) return { error: result.error };
  if (!result.me.is_platform_admin) {
    return {
      error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
    };
  }
  return { me: result.me };
}

export function page<T>(items: T[], url: URL) {
  const size = Math.min(Number(url.searchParams.get("page_size") ?? 25) || 25, 100);
  const number = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
  const start = (number - 1) * size;
  return {
    count: items.length,
    next: start + size < items.length ? `?page=${number + 1}` : null,
    previous: number > 1 ? `?page=${number - 1}` : null,
    results: items.slice(start, start + size),
  };
}

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

/** A request value as text: strings and numbers as is, anything else empty. */
export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
