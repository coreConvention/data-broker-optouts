import type { IOProvider } from "../types.js";
import type { Listing } from "../adapters/ListingAdapter.js";

/** How many times the fallback prompt is repeated after an answer it cannot read. */
const MAX_PROMPTS = 3;

/**
 * Read an answer to the numbered-list prompt.
 *
 * @returns zero-based indexes of the chosen listings (empty for "none" or an
 *   empty answer), or null when the answer is not a list of numbers in range.
 */
export function parseListingSelection(answer: string, count: number): number[] | null {
  const text = answer.trim().toLowerCase();
  if (text === "" || text === "none" || text === "n" || text === "0") {
    return [];
  }

  const chosen = new Set<number>();
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    if (!/^\d+$/.test(token)) return null;
    const number = Number(token);
    if (number < 1 || number > count) return null;
    chosen.add(number - 1);
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Ask the person which of a broker's candidate listings are theirs
 * (design plan section 4.2).
 *
 * Uses `IOProvider.selectListings` when the provider has one. Otherwise it
 * falls back to `promptUser` with a numbered list, which works in the
 * terminal and in the desktop app's existing input modal.
 *
 * The default is nothing selected: an empty answer, "none", or three answers
 * that cannot be read all return an empty list. The tool never picks for the
 * person.
 */
export async function chooseListings(
  io: IOProvider,
  request: { broker: string; listings: Listing[] }
): Promise<Listing[]> {
  const { broker, listings } = request;
  if (listings.length === 0) {
    return [];
  }

  if (io.selectListings) {
    const ids = new Set(await io.selectListings(request));
    // Ids the provider made up are ignored: only listings that were shown can be chosen.
    return listings.filter((listing) => ids.has(listing.id));
  }

  const lines = listings.map((listing, i) => `  ${i + 1}. ${listing.summary}\n     ${listing.url}`);
  const question =
    `${broker} shows ${listings.length === 1 ? "this listing" : "these listings"}:\n` +
    `${lines.join("\n")}\n` +
    "Which of these are you? e.g. 1,3 or none";

  for (let attempt = 0; attempt < MAX_PROMPTS; attempt++) {
    const answer = await io.promptUser(question, { broker });
    const indexes = parseListingSelection(answer, listings.length);
    if (indexes) {
      return indexes.map((i) => listings[i]!);
    }
    io.log(
      "warn",
      `Could not read that answer. Type the numbers (1 to ${listings.length}) of the listings that are you, separated by commas, or "none".`
    );
  }

  io.log("warn", "No listing was selected.");
  return [];
}
