/**
 * 5-minute cache of a *yes* from hasAccess, so middleware doesn't pay a
 * Supabase round trip (~300 ms through the proxy) on every request.
 *
 * Value: `v1.<authUserId>.<expiresAtSeconds>.<base64url HMAC-SHA256>`.
 * - httpOnly + signed: the browser can't read or forge it.
 * - Tied to the auth user id: a different sign-in on the same browser misses.
 * - Only "yes" is ever cached. A refusal deletes it.
 *
 * Runs in the Edge runtime (middleware), so Web Crypto only — no Buffer.
 * The HMAC key is derived from ACCESS_COOKIE_SECRET, or failing that the
 * service-role key (never sent anywhere; HMAC does not reveal it). With no
 * secret configured, caching is simply off.
 */

export const ACCESS_COOKIE = "aesta_access";
export const ACCESS_COOKIE_TTL_SECONDS = 300;

const VERSION = "v1";
const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey | null> | null = null;

function getKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    const secret =
      process.env.ACCESS_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    keyPromise = secret
      ? crypto.subtle
          .digest("SHA-256", encoder.encode(`aesta-access-cookie:${VERSION}:${secret}`))
          .then((raw) =>
            crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
              "sign",
              "verify",
            ])
          )
      : Promise.resolve(null);
  }
  return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = "";
  new Uint8Array(bytes).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Returns the cookie value to set, or null when caching is off. */
export async function signAccessCookie(
  authUserId: string,
  nowMs: number = Date.now()
): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;
  const exp = Math.floor(nowMs / 1000) + ACCESS_COOKIE_TTL_SECONDS;
  const payload = `${VERSION}.${authUserId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** True only for an unexpired, correctly signed cookie for this auth user. */
export async function verifyAccessCookie(
  value: string | undefined,
  authUserId: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [version, id, expStr, sigStr] = parts;
  if (version !== VERSION || id !== authUserId) return false;
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return false;
  // Reject anything claiming to live longer than one TTL.
  if (exp * 1000 > nowMs + ACCESS_COOKIE_TTL_SECONDS * 1000 + 5000) return false;
  const sig = fromBase64Url(sigStr);
  const key = await getKey();
  if (!sig || !key) return false;
  return crypto.subtle.verify("HMAC", key, sig, encoder.encode(`${version}.${id}.${expStr}`));
}

/** Test hook: forget the derived key (env changes between tests). */
export function __resetAccessCookieKeyForTests() {
  keyPromise = null;
}
