// Repairs storage URLs corrupted by a pre-2026-02-25 FileUploader bug that
// double-prefixed the bucket name (e.g. ".../public/payment-proofs/payment-proofs/...").
// The actual object lives at the un-doubled path, so stripping the duplicate
// segment makes historical proofs viewable again.
//
// `documents` / `purchase-documents` were added 2026-06-06: settlement bill &
// payment-proof images were stored under ".../public/documents/documents/settlements/..."
// and returned a Supabase Storage 404 ("Object not found") until repaired here.
const KNOWN_BUCKETS = [
  "payment-proofs",
  "settlement-proofs",
  "work-updates",
  "vendor-photos",
  "vendor-qr",
  "tea-shop-qr",
  "contract-documents",
  "documents",
  "purchase-documents",
];

export function sanitizeStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  for (const bucket of KNOWN_BUCKETS) {
    const doubled = `/${bucket}/${bucket}/`;
    const fixed = `/${bucket}/`;
    if (url.includes(doubled)) {
      return url.split(doubled).join(fixed);
    }
  }
  return url;
}

/**
 * Display-time normalization for any stored image URL.
 *
 * 1. Historical proofs were saved with the raw `*.supabase.co` origin, which
 *    India ISPs block — so an in-app `<img>` (or new-tab open) silently fails.
 *    When the app is configured to reach Supabase through the Cloudflare proxy
 *    (`NEXT_PUBLIC_SUPABASE_URL` on `*.workers.dev`), rewrite the origin to the
 *    proxy so the same object loads on a blocked network. New uploads already
 *    carry the proxy origin, so they pass through untouched.
 * 2. Then repair any doubled-bucket path via {@link sanitizeStorageUrl}.
 *
 * Conservative: only a parseable absolute `*.supabase.co` URL is re-hosted;
 * everything else (already-proxied, relative, or non-URL) is only sanitized.
 */
export function normalizeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  let out = url;
  const proxyBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (proxyBase && proxyBase.includes("workers.dev")) {
    try {
      const u = new URL(url);
      if (u.hostname.endsWith(".supabase.co")) {
        const proxy = new URL(proxyBase);
        u.protocol = proxy.protocol;
        u.host = proxy.host;
        out = u.toString();
      }
    } catch {
      // Not a parseable absolute URL — leave the origin as-is.
    }
  }
  return sanitizeStorageUrl(out);
}
