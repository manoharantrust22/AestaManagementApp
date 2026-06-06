import { describe, it, expect } from "vitest";
import { cleanPhoneDigits, telHref, whatsappHref, mailtoHref } from "./contact";

describe("contact helpers", () => {
  describe("cleanPhoneDigits", () => {
    it("prefixes +91 for a bare 10-digit Indian mobile", () => {
      expect(cleanPhoneDigits("9876543210")).toBe("919876543210");
    });

    it("strips a leading 0 then prefixes +91", () => {
      expect(cleanPhoneDigits("09876543210")).toBe("919876543210");
    });

    it("keeps an already country-coded number", () => {
      expect(cleanPhoneDigits("+91 98765 43210")).toBe("919876543210");
      expect(cleanPhoneDigits("919876543210")).toBe("919876543210");
    });

    it("strips spaces, dashes and parentheses", () => {
      expect(cleanPhoneDigits("98765-43210")).toBe("919876543210");
      expect(cleanPhoneDigits("(98765) 43210")).toBe("919876543210");
    });

    it("returns null for empty / no-digit input", () => {
      expect(cleanPhoneDigits("")).toBeNull();
      expect(cleanPhoneDigits(null)).toBeNull();
      expect(cleanPhoneDigits(undefined)).toBeNull();
      expect(cleanPhoneDigits("n/a")).toBeNull();
    });
  });

  describe("telHref", () => {
    it("builds a tel: link keeping a leading +", () => {
      expect(telHref("+91 98765 43210")).toBe("tel:+919876543210");
      expect(telHref("9876543210")).toBe("tel:9876543210");
    });
    it("returns null when empty", () => {
      expect(telHref("")).toBeNull();
      expect(telHref(null)).toBeNull();
    });
  });

  describe("whatsappHref", () => {
    it("builds a wa.me link with normalized digits", () => {
      expect(whatsappHref("9876543210")).toBe("https://wa.me/919876543210");
    });
    it("appends an encoded message when provided", () => {
      expect(whatsappHref("9876543210", "hi there")).toBe(
        "https://wa.me/919876543210?text=hi%20there"
      );
    });
    it("returns null when no usable number", () => {
      expect(whatsappHref(null)).toBeNull();
      expect(whatsappHref("")).toBeNull();
    });
  });

  describe("mailtoHref", () => {
    it("builds a mailto link", () => {
      expect(mailtoHref(" a@b.com ")).toBe("mailto:a@b.com");
    });
    it("returns null when empty", () => {
      expect(mailtoHref(null)).toBeNull();
      expect(mailtoHref("")).toBeNull();
    });
  });
});
