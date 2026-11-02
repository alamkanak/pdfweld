import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const run = (args) => {
  const r = spawnSync("npm", args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};
if (!existsSync("node_modules")) run(["ci", "--no-audit", "--no-fund"]);
run(["run", "test:unit"]);
run(["run", "build"]);
const install = spawnSync(
  "npx",
  ["playwright", "install", "chromium", "firefox", "webkit"],
  { stdio: "inherit" },
);
if (install.status !== 0) process.exit(install.status || 1);
run(["run", "test:e2e"]);
