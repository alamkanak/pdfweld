import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const sample = "public/field-notes.pdf";
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  await expect
    .poll(() =>
      page.locator('[data-page="0"] > canvas').first().getAttribute("width"),
    )
    .not.toBe("1");
}
test("studio opens, reads, annotates, exports, and recovers without external requests", async ({
  page,
  baseURL,
  isMobile,
}, testInfo) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(baseURL!) && !/^(blob:|data:)/.test(r.url()))
      external.push(r.url());
  });
  await open(page);
  expect(
    await page.evaluate(() => window.pdfweld.state().info?.pages.length),
  ).toBe(4);
  const screenshot = `test-results/${testInfo.project.name}-workspace.png`;
  await page.screenshot({ path: screenshot });
  await page.getByRole("button", { name: "Pen (P)", exact: true }).click();
  const ink = page.locator('[data-page="0"] canvas').last();
  const box = await ink.boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    const viewport = (await page
      .getByTestId("document-viewport")
      .boundingBox())!;
    const drawY = Math.max(box.y + 20, viewport.y + viewport.height * 0.4);
    await page.mouse.move(box.x + box.width * 0.2, drawY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, drawY + 24, {
      steps: 15,
    });
    await page.mouse.up();
  }
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations.length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations.length,
      ),
    )
    .toBe(0);
  await page.evaluate(() => window.pdfweld.action({ type: "redo" }));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const file = await saved;
  const path = await file.path();
  expect(readFileSync(path!, "utf8")).toMatch(/^%PDF/);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
test("interactive form values survive export and reopening", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    window.pdfweld.action({
      type: "fill",
      page: 3,
      field: 0,
      value: "Grace Hopper",
    }),
  );
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 3)).fields[0].value,
    ),
  ).toBe("Grace Hopper");
  await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Filled.pdf");
  });
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 3)).fields[0].value,
    ),
  ).toBe("Grace Hopper");
});
test("tools, search, page management and phone sheets are usable", async ({
  page,
  isMobile,
}) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    page.getByRole("dialog", { name: "Find your flow" }),
  ).toBeVisible();
  await page.getByPlaceholder("Search tools and commands…").fill("organize");
  await page.getByRole("option", { name: /Organize pages/ }).click();
  await expect(
    page.getByRole("dialog", { name: "A place for every page" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select page 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rotate selected pages", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.pdfweld.state().info?.pages[1].width),
    )
    .toBe(842);
  await page.getByRole("button", { name: "Back to your document" }).click();
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByPlaceholder("Find a word or phrase…").fill("design");
  await expect(page.getByText(/\d+ results/)).toBeVisible();
  await expect
    .poll(() => page.getByRole("button", { name: /design/ }).count())
    .toBeGreaterThan(0);
  if (isMobile) {
    await page
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await page.getByRole("button", { name: "Mobile comments" }).click();
    await expect(
      page.getByRole("complementary", { name: "Comments" }),
    ).toBeVisible();
  }
});
test("sample opens offline after the app is cached", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "WebKit service-worker offline handling is covered manually; automation varies by host.",
  );
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await expect(page.getByTestId("document-viewport")).toBeVisible();
});
test("concurrent opens cannot put the displayed document out of sync with the worker", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  const result = await page.evaluate(async () => {
    const bytes = new Uint8Array(
      await (await fetch("./field-notes.pdf")).arrayBuffer(),
    );
    const state = window.pdfweld.state();
    await Promise.all([
      state.open(bytes, "First.pdf"),
      state.open(bytes, "Second.pdf"),
    ]);
    return {
      displayed: window.pdfweld.state().info?.name,
      worker: (await window.pdfweld.engine.call("info")).name,
    };
  });
  expect(result).toEqual({ displayed: "First.pdf", worker: "First.pdf" });
});
