/**
 * Where to send someone after signing in. Only a same-site path is allowed:
 * it must start with a single "/", and nothing that a browser could read as
 * another host ("//evil.com", "/\\evil.com", "https://...", tabs/newlines
 * that browsers strip). Anything else falls back to the dashboard.
 */
export const DEFAULT_AFTER_LOGIN = "/site/dashboard";

/** Pages that must never be the landing page after a sign-in (loops). */
const NOT_A_DESTINATION = ["/login", "/auth/", "/no-access", "/dev-login"];

export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;

  let value = raw;
  // A value may arrive encoded once more than needed (?next=%2Fsite%2F...).
  if (/^%2f/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return fallback;
    }
  }

  // Control characters and backslashes: browsers drop or rewrite them, which
  // can turn "/\evil.com" or "/\t/evil.com" into "//evil.com".
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  // Resolve against a dummy origin; a same-site path keeps that origin.
  let url: URL;
  try {
    url = new URL(value, "https://aesta.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://aesta.invalid") return fallback;

  const path = url.pathname + url.search + url.hash;
  if (NOT_A_DESTINATION.some((p) => url.pathname === p.replace(/\/$/, "") || url.pathname.startsWith(p))) {
    return fallback;
  }
  return path;
}

/** The login methods this device remembers ("show the last one first"). */
export type LoginMethod = "azure" | "google" | "password";
export const LAST_LOGIN_METHOD_KEY = "aesta_last_login_method";

export function readLoginMethod(raw: string | null | undefined): LoginMethod | null {
  return raw === "azure" || raw === "google" || raw === "password" ? raw : null;
}

/**
 * Plain words for an OAuth failure that comes back in the URL (from Supabase
 * or the provider). Never shows the raw provider text to the person.
 */
export function oauthErrorMessage(input: {
  error?: string | null;
  code?: string | null;
  description?: string | null;
}): string | null {
  const error = (input.error ?? "").toLowerCase();
  const code = (input.code ?? "").toLowerCase();
  const text = (input.description ?? "").toLowerCase();
  if (!error && !code && !text) return null;

  if (code === "signup_disabled" || text.includes("signups not allowed") || text.includes("signup is disabled")) {
    return "This account has not been added to Aesta. Ask your company admin.";
  }
  // Azure: an account from another organisation (single-tenant app).
  if (
    text.includes("aadsts50020") ||
    text.includes("aadsts50177") ||
    text.includes("aadsts90072") ||
    text.includes("does not exist in tenant") ||
    text.includes("not in the tenant")
  ) {
    return "Use your Neram work account, or ask your company admin.";
  }
  if (code === "email_not_verified" || text.includes("email") && text.includes("verif")) {
    return "That account's email could not be confirmed. Ask your company admin.";
  }
  if (text.includes("aadsts65004") || text.includes("cancel") || text.includes("declined") || error === "access_denied") {
    return "Sign-in was cancelled. Try again when you are ready.";
  }
  return "Could not sign you in. Please try again.";
}
