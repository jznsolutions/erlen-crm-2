import { defineConfig } from "@playwright/test";

// End-to-End-Tests gegen die lokale Umgebung.
// Voraussetzung: npm run db:start && npm run db:reset && npm run seed:dev && npm run build
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "de-DE", timezoneId: "Europe/Berlin" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
