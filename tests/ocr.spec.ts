import { test, expect } from "@playwright/test";
test("OCR loads local workers and models and produces searchable text", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== "chromium" || isMobile,
    "One full OCR pipeline is sufficient; engine output is also covered by unit tests.",
  );
  test.setTimeout(120000);
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
  const before = await page.evaluate(() =>
    window.pdfweld.engine.call("text", 0),
  );
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search tools and commands…").fill("recognize");
  await page.getByRole("button", { name: /Recognize text/ }).click();
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().busy), {
      timeout: 90000,
    })
    .toBe("");
  expect(await page.evaluate(() => window.pdfweld.state().error)).toBe("");
  const after = await page.evaluate(() =>
    window.pdfweld.engine.call("text", 0),
  );
  expect(after.length).toBeGreaterThan(before.length);
  expect(external).toEqual([]);
});
