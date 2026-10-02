import { defineConfig, devices } from "@playwright/test";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],
  outputDir: "artifacts/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "EXPO_USE_METRO_WORKSPACE_ROOT=1 EXPO_PUBLIC_PREVIEW_LOGIN_ENABLED=true EXPO_PUBLIC_PREVIEW_USER_ROLE=user CI=1 pnpm exec expo start --web --port 8081",
    url: "http://127.0.0.1:8081/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.platform === "darwin" ? { executablePath: localChrome } : undefined,
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
        launchOptions: process.platform === "darwin" ? { executablePath: localChrome } : undefined,
      },
    },
  ],
});
