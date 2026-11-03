import { test, expect, type Page } from "@playwright/test";

async function openBlankPage(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    await window.pdfweld.action({ type: "blank", at: 0 });
  });
  await expect
    .poll(() =>
      page.locator('[data-page="0"] > canvas').first().getAttribute("width"),
    )
    .not.toBe("1");
}

async function chooseSignature(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  const commands = page.getByRole("dialog", { name: "Find your flow" });
  await commands
    .getByPlaceholder("Search tools and commands…")
    .fill("signature");
  await commands
    .getByRole("button", { name: /^Signature Draw a signature/ })
    .click();
  return page.getByRole("dialog", { name: "Add your signature" });
}

async function inspectAnnotation(page: Page) {
  return page.evaluate(async () => {
    const a = (await window.pdfweld.engine.call("details", 0)).annotations[0];
    const r = await window.pdfweld.engine.call("render", 0, 1, a.rect);
    let pixels = r.pixels;
    if (r.bitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = r.width;
      canvas.height = r.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(r.bitmap, 0, 0);
      pixels = ctx.getImageData(0, 0, r.width, r.height).data;
      r.bitmap.close();
    }
    let colored = 0,
      ink = 0,
      bottomWhite = true;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        const i = (y * r.width + x) * 4;
        if (pixels[i + 2] < 240) colored++;
        if (pixels[i] < 100) ink++;
        if (
          y >= r.height - 15 &&
          [pixels[i], pixels[i + 1], pixels[i + 2]].some((v) => v !== 255)
        )
          bottomWhite = false;
      }
    return {
      text: a.text,
      type: a.type,
      ratio: (a.rect[2] - a.rect[0]) / (a.rect[3] - a.rect[1]),
      colored,
      ink,
      bottomWhite,
      corner: Array.from(pixels.slice(0, 3)),
    };
  });
}

async function waitForPaintedAnnotation(page: Page) {
  const rect = await page.evaluate(
    async () =>
      (await window.pdfweld.engine.call("details", 0)).annotations[0].rect,
  );
  await expect
    .poll(() =>
      page
        .locator('[data-page="0"] > canvas')
        .first()
        .evaluate((element, rect) => {
          const canvas = element as HTMLCanvasElement;
          if (canvas.width <= 1) return 0;
          const geometry = window.pdfweld.state().info!.pages[0];
          const x = Math.floor((rect[0] * canvas.width) / geometry.width);
          const y = Math.floor((rect[1] * canvas.height) / geometry.height);
          const w = Math.max(
            1,
            Math.floor(((rect[2] - rect[0]) * canvas.width) / geometry.width),
          );
          const h = Math.max(
            1,
            Math.floor(((rect[3] - rect[1]) * canvas.height) / geometry.height),
          );
          const pixels = canvas.getContext("2d")!.getImageData(x, y, w, h).data;
          let ink = 0;
          for (let i = 2; i < pixels.length; i += 4) if (pixels[i] < 240) ink++;
          return ink;
        }, rect),
    )
    .toBeGreaterThan(20);
}

test("adding text paints readable glyphs without a colored rectangle", async ({
  page,
}, testInfo) => {
  await openBlankPage(page);
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const ink = page.locator('[data-page="0"] canvas').last();
  const box = (await ink.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.15);
  await page
    .getByRole("textbox", { name: "Text on PDF", exact: true })
    .fill("A visible note");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations.length,
      ),
    )
    .toBe(1);
  const appearance = await inspectAnnotation(page);
  expect(appearance.text).toBe("A visible note");
  expect(appearance.colored).toBeGreaterThan(20);
  expect(appearance.colored).toBeLessThan(1500);
  expect(appearance.bottomWhite).toBe(true);
  await waitForPaintedAnnotation(page);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-text-fixed.png`,
  });
});

test("signature chooser uploads an image with its proportions and keeps drawing available", async ({
  page,
}, testInfo) => {
  await openBlankPage(page);
  const picker = await chooseSignature(page);
  const filePicker = page.waitForEvent("filechooser");
  await picker
    .getByRole("button", { name: "Upload signature image", exact: true })
    .click();
  await (await filePicker).setFiles("tests/fixtures/signature.png");
  await expect(picker).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().tool))
    .toBe("image");
  const canvas = page.locator('[data-page="0"] canvas').last();
  const box = (await canvas.boundingBox())!;
  const visible = (await page.getByTestId("document-viewport").boundingBox())!;
  const side = Math.min(box.width * 0.3, visible.height * 0.25);
  const imageX = box.x + box.width * 0.15;
  const imageY = Math.max(box.y + 20, visible.y + visible.height * 0.25);
  // A deliberately square drag must fit the wide signature without stretching it.
  await page.mouse.move(imageX, imageY);
  await page.mouse.down();
  await page.mouse.move(imageX + side, imageY + side, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations.length,
      ),
    )
    .toBe(1);
  await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Image signature.pdf");
  });
  const saved = await inspectAnnotation(page);
  expect(saved.type).toBe("Stamp");
  expect(saved.text).toBe("Signature");
  expect(saved.ratio).toBeCloseTo(4, 2);
  expect(saved.ink).toBeGreaterThan(50);
  expect(saved.corner).toEqual([255, 255, 255]);
  await waitForPaintedAnnotation(page);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-image-signature.png`,
  });
  const drawing = await chooseSignature(page);
  await drawing
    .getByRole("button", { name: "Draw signature", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().tool))
    .toBe("signature");
  const drawingBox = (await page
    .locator('[data-page="0"] canvas')
    .last()
    .boundingBox())!;
  const viewport = (await page.getByTestId("document-viewport").boundingBox())!;
  // At fit-to-width the page can extend far below the viewport.
  const drawY = Math.max(drawingBox.y + 20, viewport.y + viewport.height * 0.4);
  await page.mouse.move(drawingBox.x + drawingBox.width * 0.15, drawY);
  await page.mouse.down();
  await page.mouse.move(drawingBox.x + drawingBox.width * 0.45, drawY + 24, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations.map(
          (a) => a.type,
        ),
      ),
    )
    .toEqual(["Stamp", "Ink"]);
});
