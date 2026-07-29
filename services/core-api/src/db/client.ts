import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
  ping: () => Promise<boolean>;
}

/**
 * One pool for the whole core API.
 *
 * Previously four services each held their own pool against the same
 * database. Consolidating means one pool sized once, which is both simpler
 * and easier on a serverless Postgres connection limit.
 */
export function createDatabase(url: string, poolMax: number): DbHandle {
  const sql = postgres(url, {
    max: poolMax,
    // Prepared statements are disabled so the service stays compatible with
    // transaction-mode poolers such as PgBouncer and Neon's pooled endpoint.
    prepare: false,
    onnotice: () => {},
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
    ping: async () => {
      try {
        await sql`select 1`;
        return true;
      } catch {
        return false;
      }
    },
  };
}

export { schema };
