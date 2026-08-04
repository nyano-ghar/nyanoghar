import { loadEnv } from "@nyanoghar/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs with the working directory set to this package, but `.env`
// lives at the repository root. Importing the config package walks up to find
// it — without this, `pnpm db:migrate` on a fresh clone fails with
// "Please provide required params for Postgres driver: url: ''" even though
// DATABASE_URL is sitting in the root .env.
loadEnv();

export default defineConfig({
  // Table files only. `index.ts` and `_schema.ts` re-export with ESM `.js`
  // specifiers; pointing at the leaves keeps drizzle-kit's loader happy.
  schema: "./src/db/schema/*/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
