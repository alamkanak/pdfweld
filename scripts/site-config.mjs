import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function githubRepository(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(?:git@github\.com:|ssh:\/\/(?:[^@/]+@)?github\.com\/|https?:\/\/(?:[^@/]+@)?github\.com\/)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/,
    );
  return match ? { owner: match[1], name: match[2] } : null;
}
export function siteConfig({ env = process.env, remote, cname } = {}) {
  if (remote === undefined) {
    try {
      remote = execFileSync("git", ["remote", "get-url", "origin"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      remote = "";
    }
  }
  if (cname === undefined)
    cname = existsSync("public/CNAME")
      ? readFileSync("public/CNAME", "utf8").trim()
      : "";
  const repository =
    githubRepository(env.DEPLOY_REPOSITORY || remote) ||
    (/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || "")
      ? {
          owner: env.GITHUB_REPOSITORY.split("/")[0],
          name: env.GITHUB_REPOSITORY.split("/")[1],
        }
      : null);
  if (
    cname &&
    !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(cname)
  )
    throw new Error(
      "public/CNAME must contain one hostname, without a protocol or path.",
    );
  const inferred = repository
    ? `https://${repository.owner.toLowerCase()}.github.io/${repository.name.toLowerCase() === `${repository.owner.toLowerCase()}.github.io` ? "" : `${repository.name}/`}`
    : "";
  const input = env.SITE_URL || (cname ? `https://${cname}/` : inferred);
  const verification = env.GOOGLE_SITE_VERIFICATION?.trim();
  if (verification && !/^[a-zA-Z0-9_-]+$/.test(verification))
    throw new Error(
      "GOOGLE_SITE_VERIFICATION must be the verification token, not an HTML tag.",
    );
  if (!input)
    return {
      url: null,
      base: "/",
      cname: null,
      ...(verification ? { verification } : {}),
    };
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    /%|\/\/|\s/.test(url.pathname)
  )
    throw new Error(
      "SITE_URL must be an absolute HTTPS URL without credentials, a port, query, or fragment.",
    );
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return {
    url: url.href,
    base: url.pathname,
    cname:
      url.pathname === "/" && !url.hostname.endsWith(".github.io")
        ? url.hostname
        : null,
    ...(verification ? { verification } : {}),
  };
}
