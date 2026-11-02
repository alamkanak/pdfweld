import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
const root = resolve("dist");
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
  ".webmanifest": "application/manifest+json",
  ".html": "text/html",
};
const server = createServer((req, res) => {
  const route = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!route.startsWith("/pdfweld/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const relative = route.slice("/pdfweld/".length) || "index.html";
  const file = resolve(root, relative);
  if (!file.startsWith(root + "/") || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[extname(file)] || "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4180, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("http://127.0.0.1:4180/pdfweld/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.waitForFunction(
    () => document.querySelector('[data-page="0"] > canvas')?.width > 1,
  );
  const count = await page.evaluate(
    () => window.pdfweld.state().info?.pages.length,
  );
  if (count !== 4 || errors.length)
    throw new Error(JSON.stringify({ count, errors }));
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start Combine files", exact: true })
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
    throw new Error("Home processing unexpectedly opened the editor.");
  await page.getByRole("button", { name: "Open result", exact: true }).click();
  await page.waitForFunction(
    () => window.pdfweld.state().info?.pages.length === 5,
  );
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(
    "GitHub Pages subpath verified: HTML, fonts, CSS, JavaScript, WASM workers, sample PDF, and Home PDF/image combining load under /pdfweld/.",
  );
} finally {
  await browser.close();
  server.close();
}
