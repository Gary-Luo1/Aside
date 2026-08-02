import { defineConfig } from "@playwright/test";

// CI（GitHub Actions 自带 CI=true，或显式 E2E_HEADLESS=1）以无头模式运行；
// 本地默认有头（真实浏览器窗口，适合拖选等交互验证）。
const isCi = process.env.CI === "true" || process.env.E2E_HEADLESS === "1";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: isCi,
    channel: isCi ? undefined : "chromium",
  },
  webServer: {
    command: "node tests/e2e/fake-api-server.mjs",
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
