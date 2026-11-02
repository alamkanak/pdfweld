import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { githubRepository, siteConfig } from "./site-config.mjs";
const run = (cmd, args, env = process.env) =>
  execFileSync(cmd, args, { stdio: "inherit", env });
if (!existsSync("node_modules/vite"))
  run("npm", ["ci", "--no-audit", "--no-fund"]);
const { loadEnv } = await import("vite");
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
let repo = process.argv[2] || env.DEPLOY_REPOSITORY;
if (!repo) {
  try {
    repo = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
}
const target = githubRepository(repo);
if (!target) {
  console.error(
    "Configure a GitHub origin, or run npm run deploy -- https://github.com/OWNER/REPOSITORY.git.",
  );
  process.exit(1);
}
// Preserve a custom domain configured through Pages settings, even when its
// CNAME exists only on the published branch. Explicit source config wins.
if (!env.SITE_URL && !existsSync("public/CNAME")) {
  try {
    const pages = JSON.parse(
      execFileSync(
        "gh",
        ["api", `repos/${target.owner}/${target.name}/pages`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ),
    );
    if (pages.cname) env.SITE_URL = `https://${pages.cname}/`;
  } catch {
    /* A new site or unavailable CLI uses the repository URL. */
  }
}
env.DEPLOY_REPOSITORY = repo;
const site = siteConfig({ env, remote: repo });
run("npm", ["run", "build"], { ...env, SITE_URL: site.url });
const { publish } = await import("gh-pages");
await new Promise((resolve, reject) =>
  publish(
    "dist",
    { branch: "gh-pages", repo, dotfiles: true, message: "Deploy PDFWeld" },
    (error) => (error ? reject(error) : resolve()),
  ),
);
const args = [
  `repos/${target.owner}/${target.name}/pages`,
  "-f",
  "build_type=legacy",
  "-f",
  "source[branch]=gh-pages",
  "-f",
  "source[path]=/",
];
try {
  execFileSync("gh", ["api", "--method", "POST", ...args], { stdio: "ignore" });
} catch {
  try {
    execFileSync("gh", ["api", "--method", "PUT", ...args], {
      stdio: "ignore",
    });
  } catch {
    console.log(
      "Select Settings → Pages → Deploy from a branch → gh-pages / root once if Pages is not configured.",
    );
  }
}
console.log(
  `\nPublished to gh-pages: ${site.url}\nSitemap: ${site.url}sitemap.xml`,
);
