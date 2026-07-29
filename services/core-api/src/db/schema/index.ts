/**
 * Every table in the core database, grouped by the module that owns it.
 *
 * Each module still owns a named Postgres schema (`identity`, `catalog`,
 * `adoption`, `provider`) — that boundary is unchanged. What changed is that
 * one Drizzle client can now see all of them, so a query that genuinely spans
 * two domains is a join instead of an HTTP call.
 *
 * Ownership is still a rule: a module reads and writes its own tables. Reach
 * across only where the domain truly requires it (adoption → catalog listing
 * lookup is the motivating case), and keep it to reads.
 */

export * from "./adoption/applications.js";
export * from "./catalog/pets.js";
export * from "./identity/sessions.js";
export * from "./identity/users.js";
export * from "./identity/verification.js";
export * from "./provider/providers.js";
