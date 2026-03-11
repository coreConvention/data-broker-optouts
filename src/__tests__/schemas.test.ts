import { describe, it, expect } from "vitest";
import { BrokerEntrySchema, ProfileSchema, ManifestSchema } from "../config/schemas.js";

describe("ProfileSchema", () => {
  it("validates a complete profile", () => {
    const profile = {
      fullName: "John Doe",
      email: "john@example.com",
      city: "New York",
      state: "NY",
      zip: "10001",
      phone: "555-555-5555",
      address: "123 Main St",
    };
    expect(() => ProfileSchema.parse(profile)).not.toThrow();
  });

  it("validates a minimal profile (name + email only)", () => {
    const profile = { fullName: "Jane Doe", email: "jane@example.com" };
    expect(() => ProfileSchema.parse(profile)).not.toThrow();
  });

  it("rejects missing fullName", () => {
    const profile = { email: "test@example.com" };
    expect(() => ProfileSchema.parse(profile)).toThrow();
  });

  it("rejects missing email", () => {
    const profile = { fullName: "Test User" };
    expect(() => ProfileSchema.parse(profile)).toThrow();
  });

  it("rejects invalid email format", () => {
    const profile = { fullName: "Test", email: "not-an-email" };
    expect(() => ProfileSchema.parse(profile)).toThrow();
  });

  it("accepts null optional fields", () => {
    const profile = {
      fullName: "Test",
      email: "test@example.com",
      city: null,
      state: null,
      zip: null,
      phone: null,
      address: null,
    };
    expect(() => ProfileSchema.parse(profile)).not.toThrow();
  });

  it("validates altEmails as array of emails", () => {
    const profile = {
      fullName: "Test",
      email: "test@example.com",
      altEmails: ["alt1@example.com", "alt2@example.com"],
    };
    expect(() => ProfileSchema.parse(profile)).not.toThrow();
  });

  it("rejects invalid altEmails", () => {
    const profile = {
      fullName: "Test",
      email: "test@example.com",
      altEmails: ["not-an-email"],
    };
    expect(() => ProfileSchema.parse(profile)).toThrow();
  });
});

describe("BrokerEntrySchema", () => {
  it("validates a generic broker entry", () => {
    const entry = {
      name: "TestBroker",
      removalUrl: "https://example.com/optout",
      requirements: ["online", "captcha"],
      adapter: "generic",
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });

  it("validates a broker with config selectors", () => {
    const entry = {
      name: "TestBroker",
      removalUrl: "https://example.com/optout",
      requirements: ["online"],
      adapter: "generic",
      config: {
        selectors: {
          name: "input[name='fullName']",
          email: "input[type='email']",
          submit: "button[type='submit']",
        },
        checkboxes: ["input[name='agree']"],
        postSubmitWaitMs: 3000,
      },
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });

  it("validates all adapter types", () => {
    const adapters = ["generic", "Spokeo", "Whitepages", "Nuwber", "Radaris", "BeenVerified", "Intelius", "MyLife"];
    for (const adapter of adapters) {
      const entry = {
        name: "Test",
        requirements: ["online"],
        adapter,
      };
      expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("validates all requirement types", () => {
    const requirements = [
      "online", "email", "phone", "captcha", "email-verification",
      "phone-verification", "id-upload", "id-verification", "account-required",
      "email-only", "phone-only", "profile-url-required", "unknown",
    ];
    const entry = {
      name: "Test",
      requirements,
      adapter: "generic",
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });

  it("rejects invalid adapter type", () => {
    const entry = {
      name: "Test",
      requirements: ["online"],
      adapter: "InvalidAdapter",
    };
    expect(() => BrokerEntrySchema.parse(entry)).toThrow();
  });

  it("rejects invalid requirement type", () => {
    const entry = {
      name: "Test",
      requirements: ["invalid-requirement"],
      adapter: "generic",
    };
    expect(() => BrokerEntrySchema.parse(entry)).toThrow();
  });

  it("accepts null removalUrl", () => {
    const entry = {
      name: "Test",
      removalUrl: null,
      requirements: ["email-only"],
      adapter: "generic",
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });
});

describe("ManifestSchema", () => {
  it("validates an array of broker entries", () => {
    const manifest = [
      { name: "A", requirements: ["online"], adapter: "generic" },
      { name: "B", requirements: ["email-only"], adapter: "generic" },
    ];
    expect(() => ManifestSchema.parse(manifest)).not.toThrow();
  });

  it("validates empty manifest", () => {
    expect(() => ManifestSchema.parse([])).not.toThrow();
  });

  it("rejects non-array input", () => {
    expect(() => ManifestSchema.parse("not an array")).toThrow();
  });
});
