import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Task hub request signing (TASK_HUB_CONTRACT.md > Signing). The same rule in
 * both directions: Aesta calling the hub, and the hub sending events to Aesta.
 *
 *   x-hub-app        the app key ("aesta")
 *   x-hub-timestamp  unix time in milliseconds
 *   x-hub-nonce      a new uuid for each request
 *   x-hub-signature  lowercase hex HMAC-SHA256(secret,
 *                    `${timestamp}.${nonce}.${METHOD} ${pathAndQuery}\n${body}`)
 *
 * pathAndQuery is exactly what is requested ("/api/hub/v1/tasks?as=u1"), and
 * body the exact text sent ("" for a GET). Build them once and use the same
 * strings for signing and for sending.
 */

export const HUB_HEADER = {
  app: "x-hub-app",
  timestamp: "x-hub-timestamp",
  nonce: "x-hub-nonce",
  signature: "x-hub-signature",
} as const;

/** The exact text that is signed. */
export function hubSignedText(
  timestamp: string,
  nonce: string,
  method: string,
  pathAndQuery: string,
  body: string,
): string {
  return `${timestamp}.${nonce}.${method.toUpperCase()} ${pathAndQuery}\n${body}`;
}

export function hubSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  pathAndQuery: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(hubSignedText(timestamp, nonce, method, pathAndQuery, body))
    .digest("hex");
}

/** The four headers for one request. `now`/`nonce` are for tests. */
export function signHubRequest(
  secret: string,
  app: string,
  method: string,
  pathAndQuery: string,
  body: string,
  opts: { now?: number; nonce?: string } = {},
): Record<string, string> {
  const timestamp = String(opts.now ?? Date.now());
  const nonce = opts.nonce ?? randomUUID();
  return {
    [HUB_HEADER.app]: app,
    [HUB_HEADER.timestamp]: timestamp,
    [HUB_HEADER.nonce]: nonce,
    [HUB_HEADER.signature]: hubSignature(secret, timestamp, nonce, method, pathAndQuery, body),
  };
}

/** A signed request is good for 5 minutes either side of our clock. */
export const HUB_MAX_SKEW_MS = 5 * 60 * 1000;

export type HubVerifyResult =
  | { ok: true; nonce: string }
  | {
      ok: false;
      reason: "missing_headers" | "wrong_app" | "bad_timestamp" | "too_old" | "bad_nonce" | "bad_signature";
    };

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Checks the four headers of a request the hub sent us (events). Signature,
 * app and time only: the caller must still claim the nonce once to stop a replay.
 */
export function verifyHubRequest(input: {
  headers: { get(name: string): string | null };
  secret: string;
  app: string;
  method: string;
  pathAndQuery: string;
  body: string;
  now?: number;
}): HubVerifyResult {
  const h = input.headers;
  const app = (h.get(HUB_HEADER.app) || "").trim();
  const timestamp = (h.get(HUB_HEADER.timestamp) || "").trim();
  const nonce = (h.get(HUB_HEADER.nonce) || "").trim();
  const signature = (h.get(HUB_HEADER.signature) || "").trim().toLowerCase();
  if (!app || !timestamp || !nonce || !signature) return { ok: false, reason: "missing_headers" };
  if (app !== input.app) return { ok: false, reason: "wrong_app" };
  if (!/^\d{10,16}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };
  const now = input.now ?? Date.now();
  if (Math.abs(now - Number(timestamp)) > HUB_MAX_SKEW_MS) return { ok: false, reason: "too_old" };
  if (nonce.length < 8 || nonce.length > 100) return { ok: false, reason: "bad_nonce" };
  const expected = hubSignature(input.secret, timestamp, nonce, input.method, input.pathAndQuery, input.body);
  if (!/^[0-9a-f]{64}$/.test(signature) || !safeEqualHex(signature, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, nonce };
}
