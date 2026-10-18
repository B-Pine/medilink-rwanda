import type { VitePWAOptions } from "vite-plugin-pwa";

import rw from "./src/i18n/locales/rw.json";

/**
 * PWA settings (design 07, security 06 §6).
 *
 * The service worker precaches the app shell only. It never caches /api/ responses: the API is
 * on another host, navigations to /api/ are excluded from the SPA fallback, and an explicit
 * NetworkOnly rule covers any same-origin /api/ path. A unit test (pwa.test.ts) guards this.
 * Manifest colours are design tokens: emerald-700 #047857 and page #F6F8F7.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  // Registered from main.tsx, and only outside mock mode (MSW uses its own service worker).
  injectRegister: false,
  includeAssets: ["favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png"],
  manifest: {
    id: "/",
    name: "MediLink Rwanda",
    short_name: "MediLink",
    // Kinyarwanda first (the manifest has one language); text from the resource files.
    description: rw.landing.heroBody,
    lang: "rw",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F8F7",
    theme_color: "#047857",
    categories: ["health", "medical"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,woff2,png,webp,ico}"],
    globIgnores: ["**/mockServiceWorker.js", "**/icon-dark-512.png"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    // Extra service-worker scripts (e.g. web push handlers): ONLY between the sprint's markers.
    importScripts: [
      // [S1]
      // [/S1]
      // [S3]
      // [/S3]
      // [S9]
      // [/S9]
    ],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
  devOptions: { enabled: false },
};
