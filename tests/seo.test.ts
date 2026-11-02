import { test, expect } from "vitest";
import { siteConfig, githubRepository } from "../scripts/site-config.mjs";
import { pageHead, jsonScript } from "../scripts/seo.mjs";
import {
  siteTitle,
  siteDescription,
  toolIds,
  toolPages,
  publicRoute,
  toolPath,
} from "../src/seo/pages";
import { homeTools } from "../src/lib/home-tools";
const defaults = { title: siteTitle, description: siteDescription };
const config = (
  remote = "https://github.com/alamkanak/pdfweld.git",
  env = {},
  cname = "",
) => siteConfig({ remote, env, cname });

test("deployment URLs handle HTTPS, SSH, project pages, and user pages", () => {
  for (const remote of [
    "https://github.com/alamkanak/pdfweld.git",
    "git@github.com:alamkanak/pdfweld.git",
    "ssh://git@github.com/alamkanak/pdfweld.git",
  ])
    expect(config(remote)).toEqual({
      url: "https://alamkanak.github.io/pdfweld/",
      base: "/pdfweld/",
      cname: null,
    });
  expect(
    config("https://github.com/Alamkanak/alamkanak.github.io.git").url,
  ).toBe("https://alamkanak.github.io/");
  expect(githubRepository("https://evilgithub.com/user/repo")).toBeNull();
});
test("explicit site URL and CNAME override inferred repository URLs", () => {
  expect(config(undefined, { SITE_URL: "https://pdf.example.com" })).toEqual({
    url: "https://pdf.example.com/",
    base: "/",
    cname: "pdf.example.com",
  });
  expect(config(undefined, {}, "pdf.example.com").base).toBe("/");
  expect(
    config(
      undefined,
      { SITE_URL: "https://other.example.com/tools/" },
      "pdf.example.com",
    ).url,
  ).toBe("https://other.example.com/tools/");
  expect(
    config(undefined, { DEPLOY_REPOSITORY: "git@github.com:fork/renamed.git" })
      .base,
  ).toBe("/renamed/");
  expect(
    siteConfig({
      remote: "",
      env: { GITHUB_REPOSITORY: "owner/project" },
      cname: "",
    }).base,
  ).toBe("/project/");
});
test("unconfigured builds avoid imaginary canonical URLs and invalid site URLs fail", () => {
  expect(siteConfig({ env: {}, remote: "", cname: "" }).url).toBeNull();
  for (const SITE_URL of [
    "http://example.com/",
    "https://user:password@example.com/",
    "https://example.com/?x=1",
    "https://example.com/#tools",
    "https://example.com:4433/",
    "https://example.com/a%20b/",
  ])
    expect(() => config(undefined, { SITE_URL })).toThrow();
  expect(() => config(undefined, {}, "https://example.com/path")).toThrow();
});
test("Search Console verification is opt-in and does not accept pasted HTML", () => {
  const site = config(undefined, { GOOGLE_SITE_VERIFICATION: "abc_123-def" });
  expect(pageHead(site, null, defaults)).toContain(
    'name="google-site-verification" content="abc_123-def"',
  );
  expect(pageHead(config(), null, defaults)).not.toContain(
    "google-site-verification",
  );
  expect(() =>
    config(undefined, {
      GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification">',
    }),
  ).toThrow();
});
test("all supported tools have unique static URLs and valid deep link matching", () => {
  expect(new Set(toolIds).size).toBe(homeTools.length);
  expect(new Set(toolIds.map((id) => toolPages[id].slug)).size).toBe(
    homeTools.length,
  );
  for (const base of ["/", "/pdfweld/", "/some/project/"]) {
    expect(publicRoute(base, base)).toBeNull();
    expect(publicRoute(`${base}index.html`, base)).toBeNull();
    for (const id of toolIds) {
      expect(publicRoute(toolPath(id, base), base)).toBe(id);
      expect(publicRoute(`${toolPath(id, base)}index.html`, base)).toBe(id);
      expect(toolPages[id].steps).toHaveLength(3);
    }
    expect(publicRoute(`${base}tools/missing/`, base)).toBe("not-found");
    expect(publicRoute(`${base}tools/compress-pdf/nested/`, base)).toBe(
      "not-found",
    );
  }
});
test("canonical, social, and JSON-LD URLs agree for home and every tool", () => {
  const site = config();
  for (const page of [
    null,
    ...homeTools.map((tool) => ({
      ...toolPages[tool.id],
      id: tool.id,
      label: tool.label,
    })),
  ]) {
    const head = pageHead(site, page, defaults);
    const url = page ? `${site.url}tools/${page.slug}/` : site.url;
    expect(head).toContain(`rel="canonical" href="${url}"`);
    expect(head).toContain(`property="og:url" content="${url}"`);
    expect(head).toContain(
      "https://alamkanak.github.io/pdfweld/social-card.png",
    );
    const data = JSON.parse(
      head.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      )![1],
    );
    expect(
      data["@graph"].find((node: any) => node["@type"] === "WebPage").url,
    ).toBe(url);
    expect(head.match(/rel="canonical"/g)).toHaveLength(1);
  }
  const noUrl = pageHead({ url: null, base: "/", cname: null }, null, defaults);
  expect(noUrl).toContain("noindex, follow");
  expect(noUrl).not.toContain('rel="canonical"');
});
test("metadata and structured data escape content without executable script injection", () => {
  const payload = '</script><script>alert("x")</script>';
  expect(jsonScript({ name: payload })).not.toContain("</script>");
  expect(JSON.parse(jsonScript({ name: payload })).name).toBe(payload);
  const head = pageHead(config(), null, {
    title: payload,
    description: payload,
  });
  expect(head).not.toContain('<script>alert("x")');
  expect(head).toContain("&lt;/script&gt;");
});
