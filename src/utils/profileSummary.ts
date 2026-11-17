import type { PersonProfile } from "../types.js";

/** Optional profile fields, in the order they are listed in the summary. */
const OPTIONAL_FIELDS = ["city", "state", "zip", "phone", "address", "altEmails"] as const;

/**
 * Describe a loaded profile for run output without any of its values.
 *
 * Run output (the terminal, the desktop log view) is easy to paste into a bug
 * report or a screenshot, so it names which optional fields are filled in and
 * never what they hold (issue #34).
 *
 * @param profile - The loaded profile
 * @returns A one-line summary made of field names only
 */
export function describeProfile(profile: PersonProfile): string {
  const present: string[] = OPTIONAL_FIELDS.filter((field) => {
    const value = profile[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  return present.length > 0
    ? `loaded (optional fields present: ${present.join(", ")})`
    : "loaded (no optional fields present)";
}
