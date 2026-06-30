import { defineConfig, devices } from "@playwright/test"

// E2E configuration for the Results -> Estimate -> Leads happy path.
//
// Two servers are started for the run:
//  1. A mocked backend (e2e/mock-backend.mjs) on port 8000, which keeps the
//     Google Solar lookup mocked so CI never hits the real API.
//  2. The Next.js app, built and started with NEXT_PUBLIC_API_URL pointed at the
//     mock backend so both route handlers and server components proxy to it.
//
// NEXT_PUBLIC_* values are inlined at build time, so the same value is passed to
// `next build` and `next start` below.
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100)
const BACKEND_PORT = Number(process.env.MOCK_BACKEND_PORT ?? 8000)
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
const BASE_URL = `http://127.0.0.1:${APP_PORT}`

export default defineConfig({
  testDir: "./e2e",
  // The mock backend keeps per-run state (the created estimate), so the suite
  // must run serially against a single app instance.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-backend.mjs",
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        MOCK_BACKEND_PORT: String(BACKEND_PORT),
        MOCK_BACKEND_HOST: "127.0.0.1",
      },
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${APP_PORT} --hostname 127.0.0.1`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_URL: BACKEND_URL,
      },
    },
  ],
})
