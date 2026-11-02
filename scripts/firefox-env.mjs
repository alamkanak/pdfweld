import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
// Playwright #42768: macOS 27 protects the user's Firefox app-data root.
// Give only the disposable test browser a private app-data home; do not request
// access to the user's browser profile or alter its security settings.
export function firefoxLaunchOptions() {
  if (process.platform !== "darwin") return {};
  const directory = resolve(".cache/pdfweld-firefox-home");
  mkdirSync(directory, { recursive: true });
  return { env: { ...process.env, CFFIXED_USER_HOME: directory } };
}
