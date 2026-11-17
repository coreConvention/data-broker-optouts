import type { PersonProfile } from "../types.js";

/** Profile fields as a person would name them. Names only, never values. */
const FIELD_WORDS: Record<keyof PersonProfile, string> = {
  fullName: "name",
  email: "email address",
  altEmails: "other email addresses",
  city: "city",
  state: "state",
  zip: "ZIP code",
  phone: "phone number",
  address: "street address"
};

/**
 * Name profile fields in plain words, for example "name and state".
 *
 * @param fields - Profile field keys, as a listing adapter declares them
 * @returns The fields joined as a phrase; "nothing from your profile" when empty
 */
export function describeFields(fields: readonly (keyof PersonProfile)[]): string {
  const words: string[] = [...new Set(fields.map((field) => FIELD_WORDS[field]))];
  if (words.length === 0) return "nothing from your profile";
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** A broker that a dry run still searches, and the profile fields its search sends. */
export interface SearchedBroker {
  broker: string;
  fields: readonly (keyof PersonProfile)[];
}

/**
 * What to tell the person before a dry run starts (issue #63).
 *
 * A dry run sends no removal request, but a broker with a listing adapter is
 * still searched, and its search carries the person's name. Someone trying
 * the tool with their real profile has to know that before they start, so
 * the notice names each such broker and what its search sends.
 *
 * @param searched - The brokers in this run that have a listing adapter
 * @returns The lines of the notice, without any profile value
 */
export function dryRunNotice(searched: readonly SearchedBroker[]): string[] {
  const lines: string[] = ["DRY RUN MODE: no removal request will be sent."];
  if (searched.length === 0) {
    lines.push("No broker in this run will be contacted.");
    return lines;
  }
  lines.push("A dry run still searches these brokers for your listing:");
  for (const { broker, fields } of searched) {
    lines.push(`  - ${broker} (the search sends your ${describeFields(fields)})`);
  }
  lines.push("Every other broker in this run is not contacted.");
  return lines;
}
