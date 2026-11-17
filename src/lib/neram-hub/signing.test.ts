import { describe, expect, it } from "vitest";
import { hubSignature, hubSignedText, signHubRequest, HUB_HEADER } from "./signing";

// The worked example from TASK_HUB_CONTRACT.md > Signing.
const EXAMPLE = {
  secret: "0123456789abcdef0123456789abcdef",
  timestamp: "1763114400000",
  nonce: "7d1f3c0e-0000-4000-8000-000000000001",
  method: "GET",
  pathAndQuery: "/api/hub/v1/tasks?as=user-1",
  body: "",
  signature: "64ee3ac6d4c372c5179cb3b700400bec8b5de066f0aa7f2220bf88df2ed9f8ae",
};

const sig = (over: Partial<typeof EXAMPLE> = {}) => {
  const e = { ...EXAMPLE, ...over };
  return hubSignature(e.secret, e.timestamp, e.nonce, e.method, e.pathAndQuery, e.body);
};

describe("hub signing", () => {
  it("signs the exact text from the contract, with one newline before an empty body", () => {
    expect(
      hubSignedText(EXAMPLE.timestamp, EXAMPLE.nonce, EXAMPLE.method, EXAMPLE.pathAndQuery, EXAMPLE.body),
    ).toBe("1763114400000.7d1f3c0e-0000-4000-8000-000000000001.GET /api/hub/v1/tasks?as=user-1\n");
  });

  it("gives exactly the contract's worked-example signature", () => {
    expect(sig()).toBe(EXAMPLE.signature);
  });

  it("puts the same signature in the headers, with the app, timestamp and nonce", () => {
    const headers = signHubRequest(EXAMPLE.secret, "aesta", "GET", EXAMPLE.pathAndQuery, "", {
      now: Number(EXAMPLE.timestamp),
      nonce: EXAMPLE.nonce,
    });
    expect(headers).toEqual({
      [HUB_HEADER.app]: "aesta",
      [HUB_HEADER.timestamp]: EXAMPLE.timestamp,
      [HUB_HEADER.nonce]: EXAMPLE.nonce,
      [HUB_HEADER.signature]: EXAMPLE.signature,
    });
  });

  it("writes the method in capitals", () => {
    expect(sig({ method: "get" })).toBe(EXAMPLE.signature);
  });

  it("changes when the path changes", () => {
    expect(sig({ pathAndQuery: "/api/hub/v1/running?as=user-1" })).not.toBe(EXAMPLE.signature);
  });

  it("changes when the query changes (another person)", () => {
    expect(sig({ pathAndQuery: "/api/hub/v1/tasks?as=user-2" })).not.toBe(EXAMPLE.signature);
    expect(sig({ pathAndQuery: "/api/hub/v1/tasks?as=user-1&view=all" })).not.toBe(EXAMPLE.signature);
  });

  it("changes when the body changes", () => {
    const a = sig({ method: "POST", body: '{"text":"Truck came at 4."}' });
    const b = sig({ method: "POST", body: '{"text":"Truck came at 5."}' });
    expect(a).not.toBe(b);
    // Same JSON, different text (spacing) is a different signature: send exactly what was signed.
    expect(sig({ method: "POST", body: '{ "text":"Truck came at 4."}' })).not.toBe(a);
  });

  it("changes with the method, timestamp, nonce and secret", () => {
    expect(sig({ method: "POST" })).not.toBe(EXAMPLE.signature);
    expect(sig({ timestamp: "1763114400001" })).not.toBe(EXAMPLE.signature);
    expect(sig({ nonce: "7d1f3c0e-0000-4000-8000-000000000002" })).not.toBe(EXAMPLE.signature);
    expect(sig({ secret: "x".repeat(32) })).not.toBe(EXAMPLE.signature);
  });

  it("uses a fresh uuid nonce and the current time by default", () => {
    const a = signHubRequest(EXAMPLE.secret, "aesta", "GET", "/x", "");
    const b = signHubRequest(EXAMPLE.secret, "aesta", "GET", "/x", "");
    expect(a[HUB_HEADER.nonce]).toMatch(/^[0-9a-f-]{36}$/);
    expect(a[HUB_HEADER.nonce]).not.toBe(b[HUB_HEADER.nonce]);
    expect(Math.abs(Number(a[HUB_HEADER.timestamp]) - Date.now())).toBeLessThan(5000);
  });
});
