/**
 * Delete Cache Storage entries that may hold user data. The app-shell precache (workbox-precache-*)
 * holds only static files and is kept. Sprint 0 stores no user data offline; this is the hook for
 * "Save for offline" later (security 06 §6: caches cleared on logout and account switch).
 */
export async function clearUserCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => !name.startsWith("workbox-precache"))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cache Storage can be unavailable (private mode); nothing to clear then.
  }
}
