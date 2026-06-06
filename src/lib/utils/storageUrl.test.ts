import { describe, it, expect, afterEach, vi } from "vitest";
import { sanitizeStorageUrl, normalizeImageUrl } from "./storageUrl";

const PROXY = "https://aesta-supabase-proxy.aestabuilders.workers.dev";
const RAW = "https://ocutbpoaibjxtyjkrnda.supabase.co";

describe("sanitizeStorageUrl", () => {
  it("returns empty string for nullish input", () => {
    expect(sanitizeStorageUrl(null)).toBe("");
    expect(sanitizeStorageUrl(undefined)).toBe("");
    expect(sanitizeStorageUrl("")).toBe("");
  });

  it("collapses a doubled `documents` bucket segment", () => {
    const broken = `${PROXY}/storage/v1/object/public/documents/documents/settlements/abc/bill_1.png`;
    expect(sanitizeStorageUrl(broken)).toBe(
      `${PROXY}/storage/v1/object/public/documents/settlements/abc/bill_1.png`
    );
  });

  it("collapses a doubled `purchase-documents` bucket segment", () => {
    const broken = `${PROXY}/storage/v1/object/public/purchase-documents/purchase-documents/bills/x.jpeg`;
    expect(sanitizeStorageUrl(broken)).toBe(
      `${PROXY}/storage/v1/object/public/purchase-documents/bills/x.jpeg`
    );
  });

  it("still repairs the legacy payment-proofs double prefix", () => {
    const broken = `${RAW}/storage/v1/object/public/payment-proofs/payment-proofs/x.jpeg`;
    expect(sanitizeStorageUrl(broken)).toBe(
      `${RAW}/storage/v1/object/public/payment-proofs/x.jpeg`
    );
  });

  it("leaves a correct single-segment `documents` url untouched", () => {
    const ok = `${PROXY}/storage/v1/object/public/documents/settlements/abc/bill_1.png`;
    expect(sanitizeStorageUrl(ok)).toBe(ok);
  });

  it("leaves a non-storage url untouched", () => {
    const other = "https://example.com/foo/bar.png";
    expect(sanitizeStorageUrl(other)).toBe(other);
  });
});

describe("normalizeImageUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty string for nullish input", () => {
    expect(normalizeImageUrl(null)).toBe("");
    expect(normalizeImageUrl(undefined)).toBe("");
  });

  it("rewrites a raw supabase.co origin to the proxy and repairs the doubled path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROXY);
    const broken = `${RAW}/storage/v1/object/public/documents/documents/settlements/abc/proof.jpeg`;
    expect(normalizeImageUrl(broken)).toBe(
      `${PROXY}/storage/v1/object/public/documents/settlements/abc/proof.jpeg`
    );
  });

  it("repairs a doubled path that already uses the proxy origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROXY);
    const broken = `${PROXY}/storage/v1/object/public/documents/documents/settlements/abc/bill.png`;
    expect(normalizeImageUrl(broken)).toBe(
      `${PROXY}/storage/v1/object/public/documents/settlements/abc/bill.png`
    );
  });

  it("leaves the raw origin in place when no proxy is configured (still sanitizes)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", RAW);
    const broken = `${RAW}/storage/v1/object/public/documents/documents/settlements/abc/proof.jpeg`;
    expect(normalizeImageUrl(broken)).toBe(
      `${RAW}/storage/v1/object/public/documents/settlements/abc/proof.jpeg`
    );
  });

  it("passes a non-URL value through to sanitize unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROXY);
    expect(normalizeImageUrl("not a url")).toBe("not a url");
  });
});
