import browserslist from "browserslist";
import { writeFileSync, mkdirSync } from "node:fs";
const targets = [
  "Chrome >= 90",
  "Edge >= 90",
  "Firefox >= 114",
  "Safari >= 15.4",
  "iOS >= 15.4",
  "and_chr >= 90",
  "and_ff >= 114",
  "Samsung >= 16",
  "Opera >= 76",
];
const result = {
  generated: new Date().toISOString(),
  database: "caniuse-lite / Browserslist global usage",
  databaseVersion: JSON.parse(
    (await import("node:fs")).readFileSync(
      "node_modules/caniuse-lite/package.json",
      "utf8",
    ),
  ).version,
  targets,
  estimatedGlobalCoverage: browserslist.coverage(browserslist(targets)),
  meaning:
    "Estimated global usage of targeted browser versions. Not a claim that every feature was tested on every device.",
  testedEngines: ["Chromium", "Firefox", "WebKit"],
  requiredFeatures: [
    "WebAssembly",
    "module workers",
    "ES modules and top-level await",
    "ResizeObserver",
    "IntersectionObserver",
    "IndexedDB",
  ],
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/browser-coverage.json", JSON.stringify(result, null, 2));
console.log(
  `${result.estimatedGlobalCoverage.toFixed(2)}% estimated global browser usage targeted. See reports/browser-coverage.json.`,
);
