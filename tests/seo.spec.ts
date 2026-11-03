import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { homeTools } from "../src/lib/home-tools";
import { toolPages, siteTitle } from "../src/seo/pages";
const site = JSON.parse(readFileSync("dist/site-config.json", "utf8")) as {
  url: string;
  base: string;
};
const path = (slug: string) => `${site.base}tools/${slug}/`;

test("Home and every tool have initial HTML, unique canonical metadata, and crawlable links", async ({
  request,
}) => {
  const titles = new Set<string>();
  for (const tool of [null, ...homeTools]) {
    const pagePath = tool ? path(toolPages[tool.id].slug) : site.base;
    const response = await request.get(pagePath);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const canonical = `${site.url}${tool ? `tools/${toolPages[tool.id].slug}/` : ""}`;
    expect(html).toContain(`rel="canonical" href="${canonical}"`);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain(`property="og:url" content="${canonical}"`);
    expect(html).toContain(`${site.url}social-card.png`);
    expect(html).toContain('type="application/ld+json"');
    expect(html).not.toContain("<!--seo-app-->");
    const title = html.match(/<title>(.*?)<\/title>/)![1];
    expect(titles.has(title)).toBe(false);
    titles.add(title);
    if (tool) {
      expect(html).toContain(`How to use ${tool.label.replace(/&/g, "&amp;")}`);
      expect(html).toContain(
        toolPages[tool.id].steps[0].replace(/&/g, "&amp;"),
      );
    } else {
      for (const other of homeTools)
        expect(html).toContain(`href="${path(toolPages[other.id].slug)}"`);
    }
  }
});

test("metadata and selected tool follow deep links, reload, and browser history", async ({
  page,
}) => {
  await page.goto(site.base);
  await page.waitForFunction(() => !!window.pdfweld);
  await page
    .getByRole("link", { name: "Start Compress PDF", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${path("compress-pdf")}$`));
  await expect(
    page.getByRole("heading", { name: "Compress PDF", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Compress PDF Online/);
  const metadata = () =>
    page.evaluate(() => ({
      canonical: document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]',
      )?.href,
      og: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
        ?.content,
      schema: JSON.parse(
        document.querySelector('script[type="application/ld+json"]')!
          .textContent!,
      )["@graph"].find((node: any) => node["@type"] === "WebPage").url,
    }));
  expect(await metadata()).toEqual({
    canonical: `${site.url}tools/compress-pdf/`,
    og: `${site.url}tools/compress-pdf/`,
    schema: `${site.url}tools/compress-pdf/`,
  });
  await page.reload();
  await page.waitForFunction(() => !!window.pdfweld);
  await expect(
    page.getByRole("heading", { name: "Compress PDF", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Start with a tool", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(siteTitle);
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Compress PDF", exact: true }),
  ).toBeVisible();
});

test("static pages remain readable with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto(path("compress-pdf"));
    await expect(
      page.getByRole("heading", { name: "Compress PDF", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Enable JavaScript to process PDFs.", { exact: false }),
    ).toBeVisible();
    await page.getByText("How to use Compress PDF", { exact: true }).click();
    await expect(
      page.getByText(toolPages.compress.note, { exact: true }),
    ).toBeVisible();
    await page.goto(site.base);
    await expect(
      page
        .getByRole("navigation", { name: "Explore PDF tools" })
        .getByRole("link"),
    ).toHaveCount(21);
  } finally {
    await context.close();
  }
});

test("document workspaces use generic noindex metadata and restore the public page", async ({
  page,
}) => {
  await page.goto(site.base);
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Private medical record.pdf");
  });
  await expect(page).toHaveTitle("PDF workspace | PDFWeld");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  expect(await page.locator("head").textContent()).not.toContain(
    "Private medical record",
  );
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await expect(page).toHaveTitle(siteTitle);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /index, follow, max-image-preview:large/,
  );
});

test("sitemap contains only the 22 public URLs and the social preview is a real PNG", async ({
  request,
}) => {
  const xml = await (await request.get(`${site.base}sitemap.xml`)).text();
  expect(xml.match(/<loc>/g)).toHaveLength(22);
  expect(xml).not.toMatch(
    /field-notes|benchmark|source\.zip|404|Private|localhost/,
  );
  const robots = await (await request.get(`${site.base}robots.txt`)).text();
  expect(robots).toContain(`Sitemap: ${site.url}sitemap.xml`);
  const image = await request.get(`${site.base}social-card.png`);
  expect(image.status()).toBe(200);
  const bytes = await image.body();
  expect(Array.from(bytes.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});

test("installed app can reopen a known tool offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Headless WebKit does not expose the same service-worker lifecycle.",
  );
  await page.goto(site.base);
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller && !!window.pdfweld,
  );
  await page
    .getByRole("link", { name: "Start Compress PDF", exact: true })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compress PDF", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => !!window.pdfweld);
  await expect(page).toHaveTitle(/Compress PDF Online/);
});
