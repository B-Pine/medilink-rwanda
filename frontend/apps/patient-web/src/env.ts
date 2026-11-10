/** Build-time configuration (Vite `define`, see vite.config.ts and .env.example). */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  useMocks: import.meta.env.VITE_USE_MOCKS === "true",
  /** Map tiles (upgrade 03 §2); the provider for Rwanda is open decision OD-3. */
  mapTilesUrl:
    import.meta.env.VITE_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  /**
   * The AI symptom assistant on the public pages (the /assistant page and the floating button).
   * On by default (product owner, 2026-11-08); `VITE_PUBLIC_ASSISTANT=false` hides it. Signed-in
   * patients keep it in the dashboard either way. A getter, so tests can switch it.
   */
  get publicAssistant(): boolean {
    return import.meta.env.VITE_PUBLIC_ASSISTANT !== "false";
  },
  /** The public address (canonical links, Open Graph), e.g. https://medilink.rw. */
  siteUrl: import.meta.env.VITE_SITE_URL || "",
};
