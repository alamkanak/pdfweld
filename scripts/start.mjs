import { existsSync, readFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
if (!existsSync("node_modules/vite")) {
  console.log("Installing locked dependencies…");
  const r = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (
  !existsSync("public/ocr/eng.traineddata.gz") ||
  !existsSync("public/ocr/worker.min.js") ||
  JSON.parse(readFileSync("src/lib/google-fonts.json", "utf8")).fonts.some(
    (font) => !existsSync(`public/fonts/google/${font.file}`),
  )
) {
  const assets = spawnSync(process.execPath, ["scripts/prepare-assets.mjs"], {
    stdio: "inherit",
  });
  if (assets.status !== 0) process.exit(assets.status || 1);
}
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "0.0.0.0",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
