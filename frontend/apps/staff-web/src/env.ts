/** Build-time configuration (Vite `define`, see vite.config.ts and .env.example). */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  useMocks: import.meta.env.VITE_USE_MOCKS === "true",
  /** Map tiles for the platform command centre (OD-3; OpenStreetMap in development). */
  mapTilesUrl:
    (import.meta.env as Record<string, string | undefined>).VITE_MAP_TILES_URL ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;
