/** Build-time configuration (Vite `define`, see vite.config.ts and .env.example). */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  useMocks: import.meta.env.VITE_USE_MOCKS === "true",
} as const;
