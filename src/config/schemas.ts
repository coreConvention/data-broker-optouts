import { z } from "zod";

/**
 * Schema Definitions for Data Broker Opt-Out System
 *
 * This module defines all Zod schemas for validating configuration files,
 * user profiles, and broker entries. Following Single Responsibility Principle,
 * this module handles only schema definition and validation logic.
 *
 * @module config/schemas
 */

/**
 * Zod schema for validating broker entry configuration
 *
 * Each broker entry represents a data broker website with:
 * - name: Display name of the broker
 * - category: What kind of opt-out this is (see BrokerCategorySchema)
 * - removalUrl: URL for opt-out form (if available)
 * - requirements: Array of what's needed to complete opt-out
 * - adapter: Which automation adapter to use
 * - notes: Additional information for manual steps
 * - verified: true once a person has checked the selectors against the live
 *   opt-out page; absent means false, and the generic adapter then only opens
 *   the page for the person to finish by hand
 * - config: Optional selectors and configuration for form filling
 */
/**
 * What an entry's opt-out actually does. Only "people-search" removes a
 * public listing of someone's address or phone number; the others stop
 * marketing offers, ad targeting, credit-file use or business-contact sales.
 * Kept separate so coverage counts are not inflated by entries that do not
 * take a listing down.
 */
export const BrokerCategorySchema = z.enum([
  "people-search", // Public people/phone/address lookup: opt-out removes a listing
  "marketing",     // Marketing data and mail/phone preference lists
  "ad-tech",       // Online ad targeting, device and location tracking
  "credit",        // Credit bureaus and consumer-reporting agencies
  "b2b"            // Business-contact and identity data sold to companies
]);

export const BrokerEntrySchema = z.object({
  name: z.string(),
  category: BrokerCategorySchema.optional(),
  removalUrl: z.string().url().optional().nullable(),
  requirements: z.array(
    z.enum([
      "online",              // Has online opt-out form
      "email",               // Legacy - prefer email-only or email-verification
      "phone",               // Legacy - prefer phone-only or phone-verification
      "captcha",             // Has CAPTCHA challenge
      "email-verification",  // Requires clicking confirmation link in email
      "phone-verification",  // Requires answering phone call with verification code
      "id-upload",           // Requires uploading government ID
      "id-verification",     // Requires third-party identity verification
      "account-required",    // Must create account before opting out
      "email-only",          // No online form - must email to request removal
      "phone-only",          // No online form - must call to request removal
      "profile-url-required", // Must find and include your profile URL
      "unknown"              // Requirements not yet documented
    ])
  ),
  adapter: z.enum([
    "generic",
    "Spokeo",
    "Whitepages",
    "Nuwber",
    "BeenVerified",
    "Intelius",
    "MyLife"
  ]),
  notes: z.string().optional().nullable(),
  humanInteraction: z.enum(["modal", "browser"]).optional(),
  verified: z.boolean().optional(),
  config: z.object({
    selectors: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      submit: z.string().optional()
    }).partial().optional(),
    checkboxes: z.array(z.string()).optional(),
    postSubmitWaitMs: z.number().optional()
  }).partial().optional()
});

/**
 * Zod schema for validating person profile data
 *
 * Contains personal information used to fill opt-out forms:
 * - fullName: Complete name as it appears in records
 * - email: Primary email address for verification
 * - altEmails: Alternative email addresses (optional)
 * - city, state, zip: Location information
 * - phone: Phone number (optional)
 * - address: Street address (optional)
 */
export const ProfileSchema = z.object({
  fullName: z.string(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  email: z.string().email(),
  altEmails: z.array(z.string().email()).optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional()
});

/**
 * Array of broker entries
 */
export const ManifestSchema = z.array(BrokerEntrySchema);

/**
 * The six broker states (design plan section 5.1). Mirrors BrokerState in
 * types.ts.
 */
export const BrokerStateSchema = z.enum([
  "unknown",   // Never scanned, or the last look could not tell
  "not-found", // A scan loaded properly and found no listing the person recognised
  "listed",    // At least one confirmed listing, no request outstanding
  "requested", // A removal request was completed for every confirmed listing
  "removed",   // After the window, each requested listing was looked for and was gone
  "relisted"   // A later scan found a listing at a broker that had been removed
]);

const IsoDate = z.iso.datetime();

export const ListingRecordSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  state: z.enum(["listed", "requested", "removed"]),
  requestAttempts: z.number().int().min(0),
  pending: z.enum(["email-link", "phone-call"]).nullable()
});

export const StateHistoryEntrySchema = z.object({
  at: IsoDate,
  event: z.enum(["scan", "request", "verify"]),
  result: BrokerStateSchema,
  evidence: z.string().optional(),
  source: z.literal("person").optional()
});

export const BrokerRecordSchema = z.object({
  state: BrokerStateSchema,
  lastScannedAt: IsoDate.nullable(),
  lastRequestedAt: IsoDate.nullable(),
  verifyAfter: IsoDate.nullable(),
  lastVerifiedAt: IsoDate.nullable(),
  nextCheckDue: IsoDate.nullable(),
  timesRelisted: z.number().int().min(0),
  listings: z.array(ListingRecordSchema),
  history: z.array(StateHistoryEntrySchema)
});

/**
 * Zod schema for data/state.json (design plan section 6.1).
 *
 * `version` is a literal so a file written by a newer release is refused
 * instead of being read wrongly and then saved over.
 */
export const StateFileSchema = z.object({
  version: z.literal(1),
  person: z.string().regex(/^[0-9a-f]{12}$/),
  guidanceShownAt: IsoDate.nullable(),
  brokers: z.record(z.string(), BrokerRecordSchema)
});
