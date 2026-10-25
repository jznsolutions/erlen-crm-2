import { defineConfig } from "vitest/config";

// Datenbank-Integrationstests gegen die lokale Supabase-Instanz (npm run db:start)
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
