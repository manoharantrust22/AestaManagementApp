/**
 * Deterministic idempotency-key utility for settlement submissions.
 *
 * Produces a stable UUIDv5 derived from the settlement's business content.
 * Identical business inputs always yield the same UUID; any difference in
 * content yields a different UUID. This prevents duplicate settlements when
 * the same form is submitted more than once.
 *
 * The key MUST be byte-stable across calls and devices for identical input.
 * Do NOT add npm dependencies — uses Web Crypto (available in browser AND
 * Node 18+ / Vitest jsdom).
 */

export interface SettlementKeyParts {
  /** UUID of the site this settlement belongs to */
  siteId: string;
  /** Stable record IDs identifying exactly what is settled; order-independent (sorted internally) */
  recordIds: string[];
  /** Settlement amount in rupees; normalized to integer paise internally */
  amount: number;
  /** Payment channel, e.g. 'engineer_wallet' | 'direct' */
  paymentChannel: string;
  /** Settlement/record date as 'YYYY-MM-DD' — caller passes this, NEVER today() */
  date: string;
  /** Optional extra discriminator for record-less paths, e.g. `${laborerId}:${period}` */
  extra?: string;
}

/**
 * Fixed app-namespace UUID for settlement idempotency keys (UUIDv5 namespace).
 * NEVER change this constant — doing so would invalidate every existing key
 * stored in the database and break deduplication for in-flight retries.
 */
const SETTLEMENT_NAMESPACE = "6f1d4b8e-2c3a-5e7f-9a0b-1c2d3e4f5a6b";

/**
 * Parse a canonical UUID string into its 16 bytes.
 */
function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Format 16 bytes as a lowercase RFC-4122 UUID string.
 */
function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Pure, synchronous: builds the canonical, stable string that gets hashed.
 *
 * Rules:
 * - amount is normalized to integer paise (Math.round(amount * 100))
 * - recordIds are sorted lexicographically so input order doesn't matter
 * - output is prefixed with `v1|` to allow future scheme evolution
 */
export function buildSettlementKeyInput(parts: SettlementKeyParts): string {
  const paise = Math.round(parts.amount * 100);
  const sortedIds = [...parts.recordIds].sort();
  return [
    "v1",
    `site:${parts.siteId}`,
    `chan:${parts.paymentChannel}`,
    `date:${parts.date}`,
    `amt:${paise}`,
    `recs:${sortedIds.join(",")}`,
    `x:${parts.extra ?? ""}`,
  ].join("|");
}

/**
 * Async: returns an RFC-4122 version-5 UUID string derived from the canonical
 * input using Web Crypto SHA-1 (no npm dependencies; runs in browser + Node 18+).
 *
 * RFC-4122 v5 algorithm:
 *   1. namespace bytes (16) + UTF-8 canonical string → SHA-1 digest
 *   2. take first 16 bytes of digest
 *   3. set version nibble: bytes[6] = (bytes[6] & 0x0f) | 0x50
 *   4. set variant bits:   bytes[8] = (bytes[8] & 0x3f) | 0x80
 *   5. format as lowercase xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export async function deterministicSettlementKey(
  parts: SettlementKeyParts
): Promise<string> {
  const namespaceBytes = uuidToBytes(SETTLEMENT_NAMESPACE);
  const canonical = buildSettlementKeyInput(parts);
  const nameBytes = new TextEncoder().encode(canonical);

  // Concatenate namespace + name
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes, 0);
  combined.set(nameBytes, namespaceBytes.length);

  // SHA-1 digest via Web Crypto
  const digestBuffer = await globalThis.crypto.subtle.digest("SHA-1", combined);
  const digest = new Uint8Array(digestBuffer);

  // Take first 16 bytes
  const uuidBytes = digest.slice(0, 16);

  // Set version 5
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  // Set RFC-4122 variant (10xx)
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;

  return bytesToUuid(uuidBytes);
}
