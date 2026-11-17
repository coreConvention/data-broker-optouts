/**
 * What may be said about an exception thrown by a listing-adapter step.
 *
 * The text of such an exception must never reach a result message or a log
 * line. The browser automation library quotes page addresses and typed values
 * in its error messages, and for a listing adapter those are the search
 * address and the listing address, both of which carry the person's name
 * (issue #64; same rule as #29 and #34 for run output).
 *
 * Only the kind of error is passed on, for example "TimeoutError", so the
 * person can still tell a slow page from a crash.
 *
 * @param step - The step that failed, as it should read: "the scan", "the request"
 * @param error - Whatever was thrown
 * @returns Fixed wording plus the error's kind, never its message
 */
export function describeFailure(step: string, error: unknown): string {
  const kind: string | null =
    error instanceof Error && /^[A-Za-z]+$/.test(error.name) && error.name !== "Error" ? error.name : null;
  return kind ? `${step} failed unexpectedly (${kind})` : `${step} failed unexpectedly`;
}
