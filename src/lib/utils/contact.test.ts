import { describe, it, expect } from "vitest";
import {
  cleanPhoneDigits,
  telHref,
  whatsappHref,
  mailtoHref,
  googleMapsSearchHref,
  googleBusinessHref,
} from "./contact";

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

  describe("googleMapsSearchHref", () => {
    it("joins identity parts and url-encodes the query", () => {
      expect(
        googleMapsSearchHref(["Shree Sai Ceramics", "Chennai", "India"])
      ).toBe(
        "https://www.google.com/maps/search/?api=1&query=Shree%20Sai%20Ceramics%20Chennai%20India"
      );
    });
    it("drops blank, whitespace-only, null and undefined parts", () => {
      expect(googleMapsSearchHref(["Acme", "", "  ", null, undefined])).toBe(
        "https://www.google.com/maps/search/?api=1&query=Acme"
      );
    });
    it("produces an empty query when nothing usable is given", () => {
      expect(googleMapsSearchHref([null, "  ", undefined])).toBe(
        "https://www.google.com/maps/search/?api=1&query="
      );
    });
  });

  describe("googleBusinessHref", () => {
    it("keeps an http(s) url as-is (trimmed)", () => {
      expect(googleBusinessHref("  https://maps.app.goo.gl/abc ")).toBe(
        "https://maps.app.goo.gl/abc"
      );
      expect(googleBusinessHref("http://g.co/kgs/xyz")).toBe(
        "http://g.co/kgs/xyz"
      );
    });
    it("prefixes https:// for a bare host", () => {
      expect(googleBusinessHref("maps.app.goo.gl/abc")).toBe(
        "https://maps.app.goo.gl/abc"
      );
    });
    it("returns null when blank", () => {
      expect(googleBusinessHref(null)).toBeNull();
      expect(googleBusinessHref(undefined)).toBeNull();
      expect(googleBusinessHref("   ")).toBeNull();
    });
  });
});
