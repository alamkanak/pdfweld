import { firefoxLaunchOptions } from "./scripts/firefox-env.mjs";
import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Give each run an owned loopback port. An unrelated local server must never
// be reused as the PDFWeld test host; workers inherit the chosen port.
const testPort =
  process.env.PDFWELD_TEST_PORT ||
  execFileSync(
    process.execPath,
    [
      "-e",
      "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});",
    ],
    { encoding: "utf8" },
  ).trim();
if (!/^\d+$/.test(testPort) || Number(testPort) < 1 || Number(testPort) > 65535)
  throw new Error("PDFWELD_TEST_PORT must be a valid port number.");
process.env.PDFWELD_TEST_PORT = testPort;
const baseURL = `http://127.0.0.1:${testPort}`;
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: firefoxLaunchOptions(),
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
