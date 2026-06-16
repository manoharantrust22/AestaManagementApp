import { describe, it, expect } from "vitest";
import { getPayerSourceLabel } from "./PayerSourceSelector";

describe("getPayerSourceLabel", () => {
  it("labels the built-in sources", () => {
    expect(getPayerSourceLabel("amma_money")).toBe("Amma Money");
    expect(getPayerSourceLabel("trust_account")).toBe("Trust Account");
  });

  it("uses the custom name for name-bearing sources", () => {
    expect(getPayerSourceLabel("other_site_money", "Mathur")).toBe("Site: Mathur");
    expect(getPayerSourceLabel("custom", "Friend")).toBe("Friend");
  });

  it("labels an unfunded gap as Pending", () => {
    expect(getPayerSourceLabel("pending" as never)).toBe("Pending");
  });
});
