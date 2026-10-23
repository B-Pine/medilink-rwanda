import { createHmac } from "node:crypto";

/**
 * Helpers for the integration tests (Node, real API): a cookie jar around fetch (Node's fetch
 * keeps no cookies), RFC 6238 TOTP codes, Mailpit access and response "shapes".
 */

interface Cookie {
  value: string;
  path: string;
}

/** A fetch that stores Set-Cookie answers and sends matching cookies back (one host). */
export function cookieJarFetch(base: typeof fetch = globalThis.fetch): typeof fetch {
  const jar = new Map<string, Cookie>();
  const jarFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = new Headers(init?.headers);
    const cookies = [...jar.entries()]
      .filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`);
    if (cookies.length) headers.set("Cookie", cookies.join("; "));
    const response = await base(input, { ...init, headers });
    for (const line of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = line.split(";").map((part) => part.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const attrs = Object.fromEntries(
        attributes.map((a) => {
          const i = a.indexOf("=");
          return i < 0 ? [a.toLowerCase(), ""] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)];
        }),
      );
      const expired =
        attrs["max-age"] === "0" ||
        (attrs.expires !== undefined && Date.parse(attrs.expires) < Date.now()) ||
        value === "" ||
        value === '""';
      if (expired) jar.delete(name);
      else jar.set(name, { value, path: attrs.path || "/" });
    }
    return response;
  };
  return jarFetch;
}

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** 6-digit TOTP (SHA-1, 30 s) for a base32 secret, `offset` steps from now. */
export function totp(secret: string, offset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const start = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(start) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** The text of the latest Mailpit message to `to` whose subject contains `subject`. */
export async function latestMail(mailpit: string, to: string, subject: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = (await (
      await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    ).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    const message = list.messages.find((m) => m.Subject.includes(subject));
    if (message) {
      const body = (await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      return body.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email "${subject}" to ${to} in Mailpit`);
}

/**
 * The "shape" of a JSON value: object keys (recursively) and value kinds, without values.
 * Arrays use the shape of their first element; `null` matches anything (optional data).
 */
export function shape(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

/** Differences between two shapes, as dotted paths ("missing in mock: a.b"). */
export function shapeDiff(real: unknown, mock: unknown, path = ""): string[] {
  if (real === null || mock === null) return [];
  if (Array.isArray(real) || Array.isArray(mock)) {
    if (!Array.isArray(real) || !Array.isArray(mock)) return [`${path || "."}: array vs non-array`];
    return real.length && mock.length ? shapeDiff(real[0], mock[0], `${path}[]`) : [];
  }
  if (typeof real === "object" && typeof mock === "object") {
    const r = real as Record<string, unknown>;
    const m = mock as Record<string, unknown>;
    const diffs: string[] = [];
    for (const key of Object.keys(r)) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in m)) diffs.push(`missing in mock: ${next}`);
      else diffs.push(...shapeDiff(r[key], m[key], next));
    }
    for (const key of Object.keys(m))
      if (!(key in r)) diffs.push(`only in mock: ${path ? `${path}.${key}` : key}`);
    return diffs;
  }
  return real === mock ? [] : [`${path}: ${JSON.stringify(real)} vs ${JSON.stringify(mock)}`];
}
