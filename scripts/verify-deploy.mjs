import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
const root = resolve(
  process.argv.find((arg) => arg.startsWith("--dir="))?.slice(6) || "dist",
);
const site = JSON.parse(
  readFileSync(resolve(root, "site-config.json"), "utf8"),
);
const mount = site.base;
const origin = "http://127.0.0.1:4180";
const mime = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".html": "text/html",
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, origin).pathname);
  if (mount !== "/" && path === mount.slice(0, -1)) {
    res.writeHead(301, { Location: mount });
    res.end();
    return;
  }
  let file = resolve(
    root,
    path.startsWith(mount)
      ? path.slice(mount.length) || "index.html"
      : "__missing__",
  );
  if (
    file.startsWith(`${root}/`) &&
    existsSync(file) &&
    statSync(file).isDirectory()
  )
    file = resolve(file, "index.html");
  if (
    !file.startsWith(`${root}/`) ||
    !existsSync(file) ||
    !statSync(file).isFile()
  ) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(readFileSync(resolve(root, "404.html")));
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[extname(file)] || "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(4180, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const missing = `${origin}${mount}missing/deep/page/`;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url() !== missing)
      errors.push(`${response.status()} ${response.url()}`);
  });
  for (const path of site.paths) {
    const response = await context.request.get(`${origin}${path}`);
    if (response.status() !== 200)
      throw new Error(`Static route failed: ${path}`);
    const html = await response.text();
    if (
      !html.includes('type="application/ld+json"') ||
      !html.includes(
        `rel="canonical" href="${site.url}${path.slice(mount.length)}"`,
      )
    )
      throw new Error(`Missing static SEO at ${path}`);
    const targets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((match) => match[1])
      .filter(
        (url) =>
          url.startsWith(mount) &&
          !url.endsWith("source.zip") &&
          !url.endsWith("LICENSE.txt"),
      );
    for (const target of new Set(targets)) {
      const asset = await context.request.get(`${origin}${target}`);
      if (asset.status() !== 200)
        throw new Error(`Broken static asset/link: ${path} → ${target}`);
    }
  }
  if (!existsSync(resolve(root, ".nojekyll")))
    throw new Error("Missing .nojekyll");
  const sitemap = await (
    await context.request.get(`${origin}${mount}sitemap.xml`)
  ).text();
  if ((sitemap.match(/<loc>/g) || []).length !== site.paths.length)
    throw new Error("Sitemap does not cover every public route.");
  await page.goto(`${origin}${mount}`);
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.waitForFunction(
    () => document.querySelector('[data-page="0"] > canvas')?.width > 1,
  );
  if (
    (await page.evaluate(() => window.pdfweld.state().info?.pages.length)) !== 4
  )
    throw new Error("Sample PDF failed.");
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Start Combine files", exact: true })
    .click();
  await page
    .getByLabel("Source files", { exact: true })
    .setInputFiles(["public/field-notes.pdf", "tests/fixtures/signature.png"]);
  await page
    .getByRole("button", { name: "Combine files", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "1 file ready", exact: true })
    .waitFor();
  if (await page.evaluate(() => !!window.pdfweld.state().info))
    throw new Error("Home processing opened the editor unexpectedly.");
  await page.getByRole("button", { name: "Open result", exact: true }).click();
  await page.waitForFunction(
    () => window.pdfweld.state().info?.pages.length === 5,
  );
  const notFound = await page.goto(missing);
  if (
    notFound.status() !== 404 ||
    !(
      await page.locator('meta[name="robots"]').getAttribute("content")
    )?.includes("noindex")
  )
    throw new Error("Unknown URLs must return a real, noindex 404.");
  await page
    .getByRole("heading", { name: "Page not found", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Open PDFWeld", exact: true }).click();
  await page.waitForFunction(() => !!window.pdfweld);
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(
    `Verified ${site.paths.length} static SEO routes, assets, sitemap, real 404, WASM, and PDF/image combining at ${mount} (${site.url}).`,
  );
} finally {
  await browser.close();
  server.close();
}
