/**
 * A date as the person's own calendar day, `YYYY-MM-DD`.
 *
 * Used wherever run output says when something was checked or can be checked.
 * Local time on purpose: "checked on" should name the day the person was
 * sitting at the computer, not the day it was in UTC.
 *
 * @param date - A Date, or an ISO 8601 string as kept in the state file
 */
export function formatDay(date: Date | string): string {
  const d: Date = typeof date === "string" ? new Date(date) : date;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
