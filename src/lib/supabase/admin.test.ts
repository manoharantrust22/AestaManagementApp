import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient, getServiceRoleKey } from "./admin";

describe("getServiceRoleKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads SUPABASE_SERVICE_ROLE_KEY", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key");
    expect(getServiceRoleKey()).toBe("server-key");
  });

  it("ignores the old NEXT_PUBLIC_ name (it would be inlined into browser code)", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "leaked-key");
    expect(getServiceRoleKey()).toBeUndefined();
  });

  it("createAdminClient refuses to start without the server-only key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "leaked-key");
    expect(() => createAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY is not configured/);
  });
});
