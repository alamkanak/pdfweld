import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Rect, Tool } from "../src/lib/types";

async function prepare(page: Page, tool: Tool = "text") {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    async ({ tool, image }) => {
      await window.pdfweld.openSample();
      await window.pdfweld.action({ type: "blank", at: 0 });
      await window.pdfweld.state().mark({
        tool,
        page: 0,
        rect: [60, 90, 240, 150],
        points: [
          [65, 100],
          [100, 130],
          [160, 95],
          [220, 125],
        ],
        text: tool === "text" ? "Move this text" : "Signature",
        color: "#29372f",
        width: tool === "text" ? 18 : 2,
        opacity: 1,
        author: "Test",
        ...(tool === "image" ? { image: new Uint8Array(image) } : {}),
      });
    },
    { tool, image: Array.from(readFileSync("tests/fixtures/signature.png")) },
  );
  const element = page.locator('[data-page="0"] [data-annotation]');
  await expect(element).toBeVisible();
  return element;
}
async function currentRect(page: Page): Promise<Rect> {
  return page.evaluate(
    async () =>
      (await window.pdfweld.engine.call("details", 0)).annotations[0].rect,
  );
}

for (const tool of ["text", "image", "signature"] as Tool[]) {
  test(`dragging ${tool} moves actual content, supports undo, and survives export`, async ({
    page,
  }, testInfo) => {
    const element = await prepare(page, tool);
    const before = await currentRect(page);
    const box = (await element.boundingBox())!;
    const pageBox = (await page.locator('[data-page="0"]').boundingBox())!;
    const factor = pageBox.width / 595;
    const deltaY = Math.max(55, (before[3] - before[1] + 25) * factor);
    await page.evaluate(() => window.pdfweld.metrics.start());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 25,
      box.y + box.height / 2 + deltaY,
      { steps: 20 },
    );
    await page.mouse.up();
    const performance = await page.evaluate(() =>
      window.pdfweld.metrics.stop("Annotation drag"),
    );
    expect(performance.inputSamples).toBeGreaterThan(10);
    expect(performance.inputP95).toBeLessThan(8.33);
    await testInfo.attach("drag-performance", {
      body: JSON.stringify(performance, null, 2),
      contentType: "application/json",
    });
    await expect
      // Engines can quantize native pointer positions to whole CSS pixels.
      .poll(async () =>
        Math.abs((await currentRect(page))[1] - (before[1] + deltaY / factor)),
      )
      .toBeLessThan(1.5 / factor);
    const moved = await currentRect(page);
    expect(Math.abs(moved[0] - (before[0] + 25 / factor))).toBeLessThan(
      1.5 / factor,
    );
    await expect(page.getByText("Drag to move", { exact: true })).toBeVisible();
    await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
    await expect
      .poll(async () => (await currentRect(page))[0])
      .toBeCloseTo(before[0], 2);
    await page.evaluate(() => window.pdfweld.action({ type: "redo" }));
    await expect
      .poll(async () => (await currentRect(page))[0])
      .toBeCloseTo(moved[0], 2);
    // Inspect actual exported pixels, not just the overlay's CSS position.
    const visual = await page.evaluate(
      async ({ before, moved }) => {
        const bytes = await window.pdfweld.engine.call("save");
        await window.pdfweld.state().open(bytes, "Moved.pdf");
        const png = await window.pdfweld.engine.call("image", 0, "png", 1);
        const image = await createImageBitmap(
          new Blob([new Uint8Array(png)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        image.close();
        const count = (r: Rect) => {
          const pixels = ctx.getImageData(
            Math.ceil(r[0]),
            Math.ceil(r[1]),
            Math.max(1, Math.floor(r[2] - r[0])),
            Math.max(1, Math.floor(r[3] - r[1])),
          ).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200) ink++;
          return ink;
        };
        return {
          old: count(before),
          moved: count(moved),
          annotations: (await window.pdfweld.engine.call("details", 0))
            .annotations,
        };
      },
      { before, moved },
    );
    expect(visual.old).toBe(0);
    expect(visual.moved).toBeGreaterThan(80);
    expect(visual.annotations).toHaveLength(tool === "text" ? 1 : 0);
    if (tool === "text") {
      visual.annotations[0].rect.forEach((v, i) =>
        expect(v).toBeCloseTo(moved[i], 2),
      );
      await element.click();
    }
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-move-${tool}.png`,
    });
  });
}

test("selection supports keyboard movement, resizing, and editing", async ({
  page,
}) => {
  const element = await prepare(page, "image");
  await element.click();
  const before = await currentRect(page);
  const originalBox = (await element.boundingBox())!;
  const factor =
    (await page.locator('[data-page="0"]').boundingBox())!.width / 595;
  await element.press("Shift+ArrowRight");
  await expect
    .poll(async () => (await currentRect(page))[0])
    .toBeCloseTo(before[0] + 10, 2);
  // The worker commit can complete before the new page raster and overlay
  // are displayed. Target the handle after it reaches the visible position.
  await expect
    .poll(async () => (await element.boundingBox())!.x)
    .toBeCloseTo(originalBox.x + 10 * factor, 1);
  const handle = page.getByRole("button", {
    name: "Resize signature",
    exact: true,
  });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      const r = await currentRect(page);
      return r[2] - r[0];
    })
    .toBeGreaterThan(before[2] - before[0] + 10);
  const resized = await currentRect(page);
  expect((resized[2] - resized[0]) / (resized[3] - resized[1])).toBeCloseTo(
    (before[2] - before[0]) / (before[3] - before[1]),
    2,
  );
  await page
    .getByRole("button", { name: "Style signature", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Appearance", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Custom color")).toHaveCount(0);
  await expect(page.getByLabel("Opacity", { exact: true })).toBeVisible();
});

test("a finger can drag an element without scrolling the phone viewport", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native touch-drag injection is available through Chromium's test protocol.",
  );
  const element = await prepare(page);
  const before = await currentRect(page),
    box = (await element.boundingBox())!;
  const scrolled = await page
    .getByTestId("document-viewport")
    .evaluate((node) => node.scrollTop);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 8; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 3, y: y + i * 5, id: 1 }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => (await currentRect(page))[1])
    .toBeGreaterThan(before[1] + 20);
  expect(
    await page
      .getByTestId("document-viewport")
      .evaluate((node) => node.scrollTop),
  ).toBe(scrolled);
});

test("navigation cancels an unfinished element drag", async ({ page }) => {
  const element = await prepare(page);
  const before = await currentRect(page);
  const box = (await element.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 25,
    box.y + box.height / 2 + 40,
    { steps: 5 },
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("pdfweld-navigation-start")),
  );
  await page.mouse.up();
  expect(await currentRect(page)).toEqual(before);
  await expect
    .poll(async () => (await element.boundingBox())!.x)
    .toBeCloseTo(box.x, 1);
});
