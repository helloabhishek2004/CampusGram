import { describe, it, expect } from "vitest";
import AboutPage, { metadata as aboutMetadata } from "../app/about/page";
import HelpPage, { metadata as helpMetadata } from "../app/help/page";
import PrivacyPage, { metadata as privacyMetadata } from "../app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "../app/terms/page";

describe("Legal and Informational Pages", () => {
  describe("Metadata", () => {
    it("exports descriptive metadata for About page", () => {
      expect(aboutMetadata.title).toContain("About");
      expect(aboutMetadata.description).toBeDefined();
    });

    it("exports descriptive metadata for Help page", () => {
      expect(helpMetadata.title).toContain("Help");
      expect(helpMetadata.description).toBeDefined();
    });

    it("exports descriptive metadata for Privacy Policy page", () => {
      expect(privacyMetadata.title).toContain("Privacy");
      expect(privacyMetadata.description).toBeDefined();
    });

    it("exports descriptive metadata for Terms of Service page", () => {
      expect(termsMetadata.title).toContain("Terms");
      expect(termsMetadata.description).toBeDefined();
    });
  });

  describe("Page Components", () => {
    it("renders About page as a valid React element", () => {
      const element = AboutPage();
      expect(element).toBeDefined();
      expect(element.type).toBeDefined();
    });

    it("renders Help page as a valid React element", () => {
      const element = HelpPage();
      expect(element).toBeDefined();
      expect(element.type).toBeDefined();
    });

    it("renders Privacy Policy page as a valid React element", () => {
      const element = PrivacyPage();
      expect(element).toBeDefined();
      expect(element.type).toBeDefined();
    });

    it("renders Terms of Service page as a valid React element", () => {
      const element = TermsPage();
      expect(element).toBeDefined();
      expect(element.type).toBeDefined();
    });
  });
});
