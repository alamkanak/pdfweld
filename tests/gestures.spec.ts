import { test, expect } from "@playwright/test";
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('[data-page="0"] > canvas')!
        .width > 1,
  );
}
test("wheel zoom preserves the document point under the cursor", async ({
  page,
}) => {
  await open(page);
  const point = await page.evaluate(() => {
    const paper = document
        .querySelector('[data-page="0"]')!
        .getBoundingClientRect(),
      view = document
        .querySelector('[data-testid="document-viewport"]')!
        .getBoundingClientRect();
    return {
      x: paper.left + paper.width / 2,
      y: Math.min(view.bottom - 40, paper.top + paper.height * 0.3),
      u: 0.5,
      v:
        (Math.min(view.bottom - 40, paper.top + paper.height * 0.3) -
          paper.top) /
        paper.height,
    };
  });
  await page.getByTestId("document-viewport").dispatchEvent("wheel", {
    ctrlKey: true,
    deltaY: -100,
    clientX: point.x,
    clientY: point.y,
  });
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().zoom))
    .toBeGreaterThan(1.5);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const after = await page.evaluate(({ u, v }) => {
    const r = document
      .querySelector('[data-page="0"]')!
      .getBoundingClientRect();
    return { x: r.left + r.width * u, y: r.top + r.height * v };
  }, point);
  expect(Math.abs(after.x - point.x)).toBeLessThan(3);
  expect(Math.abs(after.y - point.y)).toBeLessThan(3);
});
test("a two-finger pinch cancels an in-progress pen stroke", async ({
  page,
}) => {
  await open(page);
  test.skip(
    !(await page.evaluate(() =>
      (() => {
        try {
          const t = new Touch({ identifier: 1, target: document.body });
          new TouchEvent("touchstart", { touches: [t] });
          return true;
        } catch {
          return false;
        }
      })(),
    )),
    "This browser does not expose synthetic touch constructors.",
  );
  await page.evaluate(() => window.pdfweld.state().set({ tool: "ink" }));
  const ink = page.locator('[data-page="0"] canvas').last();
  const box = (await ink.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height * 0.25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.evaluate(
    ({ x, y }) => {
      const view = document.querySelector('[data-testid="document-viewport"]')!;
      const event = (type: string, distance: number) =>
        view.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [
                    new Touch({
                      identifier: 1,
                      target: view,
                      clientX: x - distance,
                      clientY: y,
                    }),
                    new Touch({
                      identifier: 2,
                      target: view,
                      clientX: x + distance,
                      clientY: y,
                    }),
                  ],
          }),
        );
      event("touchstart", 30);
      event("touchmove", 45);
      event("touchend", 0);
    },
    { x, y },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations.length,
    ),
  ).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().zoom))
    .toBeCloseTo(1.5);
});
test("deep zoom does not allocate an unbounded ink canvas", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    window.pdfweld.state().set({ zoom: 5, tool: "ink" }),
  );
  await expect
    .poll(() =>
      page
        .locator('[data-page="0"] canvas')
        .last()
        .evaluate((c: HTMLCanvasElement) => c.width * c.height),
    )
    .toBeGreaterThan(100000);
  const pixels = await page
    .locator('[data-page="0"] canvas')
    .last()
    .evaluate((c: HTMLCanvasElement) => c.width * c.height);
  expect(pixels).toBeLessThan(2_510_000);
});
