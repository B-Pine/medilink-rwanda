import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

import { readPreference, writePreference } from "../preferences/storage";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import rw from "./locales/rw.json";

/** Kinyarwanda first (design 10 §3, NFR-UX-01), then English and French. */
export const SUPPORTED_LANGUAGES = ["rw", "en", "fr"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "rw";

export type TranslationTree = { [key: string]: string | TranslationTree };
export type AppResources = Record<Language, TranslationTree>;

/** Strings of the shared components (namespace `ui`). */
export const uiResources: AppResources = { rw, en, fr };

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function storedLanguage(): Language | null {
  const value = readPreference("language");
  return isLanguage(value) ? value : null;
}

function syncDocumentLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

export interface CreateI18nOptions {
  /** Force a language (tests). Default: the stored choice, else Kinyarwanda. */
  language?: Language;
  /** Remember the user's choice across visits (non-sensitive preference). Default true. */
  persist?: boolean;
}

/**
 * Create the i18next instance of an app: app strings in the default `translation` namespace,
 * component strings in `ui`. Keeps <html lang> in sync with the active language.
 */
export function createI18n(appResources: AppResources, options: CreateI18nOptions = {}): I18n {
  const instance = i18next.createInstance();
  const language = options.language ?? storedLanguage() ?? DEFAULT_LANGUAGE;
  const persist = options.persist ?? true;

  void instance.use(initReactI18next).init({
    resources: Object.fromEntries(
      SUPPORTED_LANGUAGES.map((lng) => [
        lng,
        { translation: appResources[lng], ui: uiResources[lng] },
      ]),
    ),
    lng: language,
    // Missing keys fall back to English rather than showing a raw key (parity is tested).
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: ["translation", "ui"],
    defaultNS: "translation",
    // React already escapes output; never render translations as HTML.
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });

  syncDocumentLanguage(instance.language);
  instance.on("languageChanged", (lng) => {
    syncDocumentLanguage(lng);
    if (persist && isLanguage(lng)) writePreference("language", lng);
  });
  return instance;
}

/**
 * Add feature translation namespaces to an app's resources: each feature's strings live in
 * `src/features/<feature>/locales/{rw,en,fr}.json` and are reachable as `t("<feature>.key")`
 * (shared-file protocol: docs/architecture/contracts/README.md).
 */
export function withFeatureResources(
  base: AppResources,
  features: Record<string, AppResources>,
): AppResources {
  const merged: AppResources = { rw: { ...base.rw }, en: { ...base.en }, fr: { ...base.fr } };
  for (const [feature, resources] of Object.entries(features)) {
    for (const lng of SUPPORTED_LANGUAGES) {
      if (feature in merged[lng]) {
        throw new Error(`Translation key "${feature}" is already used by the app resources`);
      }
      merged[lng] = { ...merged[lng], [feature]: resources[lng] };
    }
  }
  return merged;
}

/** Flatten a translation tree to dotted keys (used by tests and the i18n review script). */
export function flattenKeys(tree: TranslationTree, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[path] = value;
    else Object.assign(result, flattenKeys(value, path));
  }
  return result;
}

export { dateFormat, hasKinyarwandaDates, setKinyarwandaDatesSupport } from "./dates";
export type { DateFormat } from "./dates";
