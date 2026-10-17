import type { LanguageCode } from "../types";

/**
 * Server messages the mocks return, localised by Accept-Language like the real API.
 * Kinyarwanda here is mock data only (the UI's own strings live in the i18n resource files).
 */
const MESSAGES = {
  validation: {
    en: "Some fields need attention.",
    fr: "Certains champs doivent être corrigés.",
    rw: "Hari ibyo ugomba gukosora.",
  },
  required: {
    en: "This field is required.",
    fr: "Ce champ est obligatoire.",
    rw: "Iki gice kigomba kuzuzwa.",
  },
  invalidEmail: {
    en: "Enter a valid email address.",
    fr: "Saisissez une adresse e-mail valide.",
    rw: "Andika imeyili yemewe.",
  },
  passwordTooShort: {
    en: "Use at least {min} characters.",
    fr: "Utilisez au moins {min} caractères.",
    rw: "Koresha nibura inyuguti {min}.",
  },
  emailTaken: {
    en: "Check this email address or log in instead.",
    fr: "Vérifiez cette adresse e-mail ou connectez-vous.",
    rw: "Reba iyi meyili cyangwa winjire.",
  },
  invalidCredentials: {
    en: "Email or password is incorrect.",
    fr: "L’e-mail ou le mot de passe est incorrect.",
    rw: "Imeyili cyangwa ijambo ry’ibanga si byo.",
  },
  invalidCode: {
    en: "This code is not valid. Check your app and try again.",
    fr: "Ce code n’est pas valide. Vérifiez votre application et réessayez.",
    rw: "Iyi kode si yo. Reba porogaramu yawe wongere ugerageze.",
  },
  invalidRecoveryCode: {
    en: "This recovery code is not valid or was already used.",
    fr: "Ce code de récupération n’est pas valide ou a déjà été utilisé.",
    rw: "Iyi kode yo kugarura si yo cyangwa yarakoreshejwe.",
  },
  invalidResetLink: {
    en: "This link is invalid or has expired. Ask for a new one.",
    fr: "Ce lien n’est pas valide ou a expiré. Demandez-en un nouveau.",
    rw: "Iri huriro ntirigikora. Saba irindi.",
  },
  rateLimited: {
    en: "Too many attempts. Try again in {seconds} seconds.",
    fr: "Trop de tentatives. Réessayez dans {seconds} secondes.",
    rw: "Wagerageje inshuro nyinshi. Ongera ugerageze nyuma y’amasegonda {seconds}.",
  },
  notAuthenticated: {
    en: "You are not logged in.",
    fr: "Vous n’êtes pas connecté.",
    rw: "Ntabwo winjiye.",
  },
  mfaRequired: {
    en: "Enter the code from your authenticator app.",
    fr: "Saisissez le code de votre application d’authentification.",
    rw: "Andika kode iri muri porogaramu yawe yo kwemeza.",
  },
  notFound: {
    en: "Not found.",
    fr: "Introuvable.",
    rw: "Ntibibonetse.",
  },
  csrfFailed: {
    en: "CSRF check failed. Reload the page and try again.",
    fr: "Échec de la vérification CSRF. Rechargez la page et réessayez.",
    rw: "Igenzura ry’umutekano ryanze. Ongera ufungure paji ugerageze.",
  },
} satisfies Record<string, Record<LanguageCode, string>>;

export type MessageKey = keyof typeof MESSAGES;

export function languageFrom(request: Request): LanguageCode {
  const header = request.headers.get("Accept-Language") ?? "";
  const code = header.trim().slice(0, 2).toLowerCase();
  return code === "en" || code === "fr" || code === "rw" ? code : "rw";
}

export function message(
  key: MessageKey,
  language: LanguageCode,
  params: Record<string, string | number> = {},
): string {
  let text: string = MESSAGES[key][language];
  for (const [name, value] of Object.entries(params))
    text = text.replace(`{${name}}`, String(value));
  return text;
}
