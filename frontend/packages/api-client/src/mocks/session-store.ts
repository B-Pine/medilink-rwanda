/**
 * Where the mocks keep their "server-side" session state.
 *
 * - Tests use the in-memory store.
 * - The browser worker uses a cookie so a mock session survives a page reload, like the real
 *   API session cookie would. It holds only mock state (an email and a login stage), never a
 *   token, and exists only when the app is built with VITE_USE_MOCKS=true.
 */
export interface MockSessionStore {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T | null): void;
}

export function createMemoryStore(): MockSessionStore {
  const values = new Map<string, unknown>();
  return {
    read: <T>(key: string) => (values.has(key) ? (values.get(key) as T) : null),
    write: (key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
  };
}

export function createCookieStore(prefix = "ml_mock_"): MockSessionStore {
  const cookieName = (key: string) => `${prefix}${key}`;
  return {
    read<T>(key: string): T | null {
      const name = `${cookieName(key)}=`;
      const entry = document.cookie.split("; ").find((part) => part.startsWith(name));
      if (!entry) return null;
      try {
        return JSON.parse(decodeURIComponent(entry.slice(name.length))) as T;
      } catch {
        return null;
      }
    },
    write(key, value) {
      const name = cookieName(key);
      if (value === null) {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      } else {
        document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; Path=/; SameSite=Lax`;
      }
    },
  };
}
