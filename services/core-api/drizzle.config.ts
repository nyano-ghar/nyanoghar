import { defineConfig } from "drizzle-kit";

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
