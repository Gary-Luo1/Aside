import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    // CI 以无头模式运行；本地默认有头（需要真实浏览器窗口）。
    headless: process.env.E2E_HEADLESS === "1",
    channel: process.env.E2E_HEADLESS === "1" ? undefined : "chromium",
  },
  webServer: {
    command: "node tests/e2e/fake-api-server.mjs",
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
