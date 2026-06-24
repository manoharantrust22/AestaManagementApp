/**
 * Shared phone-contact helpers for tap-to-call / WhatsApp links.
 *
 * Numbers are stored exactly as entered (never normalized in the DB) — we
 * normalize only here, at link-build time, so nothing is lost. Bare 10-digit
 * Indian mobiles get a +91 country code for WhatsApp; the `tel:` link keeps a
 * leading + so the dialer can handle it.
 */

/**
 * Reduce a raw phone string to wa.me-ready digits (country code + number, no +).
 * Assumes +91 (India) for bare 10-digit and 0-prefixed 11-digit inputs.
 * Returns null when there are no usable digits.
 */
export function cleanPhoneDigits(raw?: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  // 0XXXXXXXXXX (national trunk prefix) → drop the 0
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  // bare 10-digit Indian mobile → prefix country code
  if (d.length === 10) d = "91" + d;
  return d;
}

/** Build a `tel:` href, or null when there's no number. Keeps a leading +. */
export function telHref(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : null;
}

/** Build a `https://wa.me/<digits>` href (optionally with a prefilled message). */
export function whatsappHref(phone?: string | null, message?: string): string | null {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Build a `mailto:` href, or null. */
export function mailtoHref(email?: string | null): string | null {
  const e = email?.trim();
  return e ? `mailto:${e}` : null;
}

/**
 * Build a Google Maps SEARCH url prefilled with the vendor's identity — for
 * FINDING a listing to copy its share link. Blank/whitespace parts are dropped.
 */
export function googleMapsSearchHref(
  parts: Array<string | null | undefined>
): string {
  const q = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Normalize a pasted Google Business / Maps link for opening. Stored as-is in
 * the DB; here we only trim and add an https:// scheme when the user pasted a
 * bare host. Returns null when blank.
 */
export function googleBusinessHref(url?: string | null): string | null {
  const u = url?.trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
