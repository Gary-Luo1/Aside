import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: true,
    channel: "chromium",
  },
  webServer: {
    command: "node tests/e2e/fake-api-server.mjs",
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
