import { describe, it, expect, beforeEach } from "vitest";
import { getStoredCompanyId, storeCompanyId } from "./CompanyProvider";

const KEY = "selectedCompanyId";

describe("company storage (per-tab)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredCompanyId()).toBeNull();
  });

  it("storeCompanyId writes BOTH sessionStorage and localStorage", () => {
    storeCompanyId("c-1");
    expect(sessionStorage.getItem(KEY)).toBe("c-1");
    expect(localStorage.getItem(KEY)).toBe("c-1");
  });

  it("prefers per-tab sessionStorage over shared localStorage", () => {
    localStorage.setItem(KEY, "shared-company");
    sessionStorage.setItem(KEY, "this-tab-company");
    expect(getStoredCompanyId()).toBe("this-tab-company");
  });

  it("falls back to shared localStorage when sessionStorage is empty (fresh-tab seed)", () => {
    localStorage.setItem(KEY, "shared-company");
    expect(getStoredCompanyId()).toBe("shared-company");
  });

  it("clearing (null) removes from BOTH stores", () => {
    storeCompanyId("c-1");
    storeCompanyId(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
