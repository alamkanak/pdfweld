import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
if (!existsSync("node_modules/vite"))
  run("npm", ["ci", "--no-audit", "--no-fund"]);
let repo = process.argv[2] || process.env.DEPLOY_REPOSITORY;
if (!repo)
  try {
    repo = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
  } catch {}
if (!repo) {
  console.error(
    "No GitHub repository is configured. Add your GitHub repository as origin, then run npm run deploy again. Or set DEPLOY_REPOSITORY to its Git URL.",
  );
  process.exit(1);
}
if (!/github\.com[:/]/.test(repo)) {
  console.error("Deployment requires a GitHub repository URL.");
  process.exit(1);
}
run("npm", ["run", "build"]);
writeFileSync("dist/.nojekyll", "");
const { publish } = await import("gh-pages");
await new Promise((resolve, reject) =>
  publish(
    "dist",
    { branch: "gh-pages", repo, dotfiles: true, message: "Deploy PDFWeld" },
    (e) => (e ? reject(e) : resolve()),
  ),
);
const match = repo.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
if (match) {
  try {
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${match[1]}/${match[2]}/pages`,
        "-f",
        "source[branch]=gh-pages",
        "-f",
        "source[path]=/",
      ],
      { stdio: "ignore" },
    );
  } catch {
    try {
      execFileSync(
        "gh",
        [
          "api",
          "--method",
          "PUT",
          `repos/${match[1]}/${match[2]}/pages`,
          "-f",
          "source[branch]=gh-pages",
          "-f",
          "source[path]=/",
        ],
        { stdio: "ignore" },
      );
    } catch {
      console.log(
        "If Pages is not enabled, select the gh-pages branch once in repository settings.",
      );
    }
  }
}
console.log(
  `\nDeployed to gh-pages. Set GitHub Settings → Pages → Deploy from branch → gh-pages / root.\n${match ? `https://${match[1]}.github.io/${match[2]}/` : ""}`,
);
