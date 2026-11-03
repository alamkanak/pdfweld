import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
const files = {};
for (const root of [
  "src",
  "scripts",
  "tests",
  ".github",
  "docs",
  "reports",
  "public/fonts",
]) {
  if (!existsSync(root)) continue;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[path] = new Uint8Array(readFileSync(path));
    }
  };
  walk(root);
}
for (const name of [
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.ts",
  "tailwind.config.ts",
  "postcss.config.cjs",
  "tsconfig.json",
  "playwright.config.ts",
  "vitest.config.ts",
])
  try {
    files[name] = new Uint8Array(readFileSync(name));
  } catch {}
for (const name of [
  "public/icon.svg",
  "public/icon-180.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/field-notes.pdf",
  "public/field-notes-cover.png",
  "public/benchmark-100-pages.pdf",
  "public/benchmark-scans.pdf",
  "public/social-card.svg",
  "public/social-card.png",
])
  files[name] = new Uint8Array(readFileSync(name));
// Retain the licenses of shipped dependencies, including transitive packages.
if (existsSync("public/CNAME"))
  files["public/CNAME"] = new Uint8Array(readFileSync("public/CNAME"));
// Keep site ownership verification files in downloadable source rebuilds too.
for (const entry of readdirSync("public", { withFileTypes: true })) {
  if (entry.isFile() && /^google[a-zA-Z0-9_-]+\.html$/.test(entry.name)) {
    const path = join("public", entry.name);
    files[path] = new Uint8Array(readFileSync(path));
  }
}
const collectLicenses = (directory) => {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith("@")) {
      collectLicenses(path);
      continue;
    }
    if (existsSync(join(path, "package.json"))) {
      const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
      const name = String(pkg.name)
        .replaceAll("/", "__")
        .replace(/[^a-zA-Z0-9_.-]/g, "_");
      const destination = join("licenses", `${name}-${pkg.version}`);
      for (const license of readdirSync(path, { withFileTypes: true })) {
        if (
          !license.isFile() ||
          !/^(licen[sc]e|copying|notice|ofl)(?:[.-]|$)/i.test(license.name)
        )
          continue;
        const contents = readFileSync(join(path, license.name));
        mkdirSync(join("dist", destination), { recursive: true });
        writeFileSync(join("dist", destination, license.name), contents);
        files[join(destination, license.name)] = new Uint8Array(contents);
      }
    }
    collectLicenses(join(path, "node_modules"));
  }
};
collectLicenses("node_modules");
writeFileSync("dist/source.zip", zipSync(files, { level: 6 }));
writeFileSync("dist/LICENSE.txt", readFileSync("LICENSE"));
writeFileSync(
  "dist/THIRD_PARTY_NOTICES.txt",
  readFileSync("THIRD_PARTY_NOTICES.md"),
);
console.log("Source and license bundle included in dist/source.zip.");
