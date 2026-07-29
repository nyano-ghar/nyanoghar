import { config } from "../config.js";

/**
 * Per-route rate limit, disabled under NODE_ENV=test.
 *
 * The limits themselves are real security controls and must stay in place in
 * every other environment. Integration tests drive dozens of registrations
 * and logins from a single address, so leaving them on would make the suite
 * fail on throttling rather than on behaviour. Tests that care about
 * throttling should assert it explicitly instead of relying on these.
 */
export function rateLimit(
  max: number,
  timeWindow: string,
): { rateLimit?: { max: number; timeWindow: string } } {
  if (config.NODE_ENV === "test") return {};
  return { rateLimit: { max, timeWindow } };
}
