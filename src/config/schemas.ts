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
 * - removalUrl: URL for opt-out form (if available)
 * - requirements: Array of what's needed to complete opt-out
 * - adapter: Which automation adapter to use
 * - notes: Additional information for manual steps
 * - config: Optional selectors and configuration for form filling
 */
export const BrokerEntrySchema = z.object({
  name: z.string(),
  removalUrl: z.string().url().optional().nullable(),
  requirements: z.array(
    z.enum(["online", "email", "phone", "captcha", "email-verification", "id-upload", "unknown"])
  ),
  adapter: z.enum([
    "generic",
    "Spokeo",
    "Whitepages",
    "Nuwber",
    "Radaris",
    "BeenVerified",
    "Intelius",
    "MyLife"
  ]),
  notes: z.string().optional().nullable(),
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
