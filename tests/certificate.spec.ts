import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("certificate signing stays local and exports a real signed PDF", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "The same signing worker is exercised on all desktop browser engines.",
  );
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !/^(blob:|data:)/.test(r.url())
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search tools and commands…").fill("certificate");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Sign with certificate/ }).click();
  await (await chooser).setFiles("tests/fixtures/test-only.p12");
  await page.getByLabel("Certificate password").fill("pdfweld-test");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Sign and export", exact: true })
    .click();
  const file = await download;
  const bytes = readFileSync((await file.path())!);
  expect(bytes.toString("latin1")).toContain("/ByteRange");
  expect(bytes.toString("latin1")).toContain("ETSI.CAdES.detached");
  expect(external).toEqual([]);
  expect(await page.evaluate(() => window.pdfweld.state().error)).toBe("");
});
