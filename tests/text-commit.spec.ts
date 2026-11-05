import { test, expect, type Page } from "@playwright/test";

async function start(
  page: Page,
  fontSize: number,
  content: string,
  fontFamily?: string,
) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    async ({ fontSize, fontFamily }) => {
      await window.pdfweld.openSample();
      await window.pdfweld.action({ type: "blank", at: 0 });
      window.pdfweld
        .state()
        .set({
          textSize: fontSize,
          color: "#3259a4",
          ...(fontFamily ? { fontFamily } : {}),
        });
    },
    { fontSize, fontFamily },
  );
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.width * 0.15);
  await page
    .getByRole("textbox", { name: "Text on PDF", exact: true })
    .fill(content);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    Array.from(document.fonts).some(
      (font) =>
        font.family.includes("PDFWeld Helvetica") && font.status === "loaded",
    ),
  );
  if (fontFamily)
    await page.waitForFunction(
      (id) =>
        Array.from(document.fonts).some(
          (font) =>
            font.family.includes(`PDFWeldFont${id}`) &&
            font.status === "loaded",
        ),
      fontFamily,
    );
}

for (const fontSize of [6, 18, 32]) {
  test(`Done keeps the ${fontSize} pt box unchanged, including repeated edit commits`, async ({
    page,
  }) => {
    await start(
      page,
      fontSize,
      "Keep this text steady.\nThis sentence wraps without moving the box.",
    );
    const before = await page.evaluate(() => window.pdfweld.state().textDraft!);
    const geometry = (await page.locator("[data-text-editor]").boundingBox())!;
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Text on PDF", exact: true }),
      ).toHaveCount(0);
      const a = await page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0],
      );
      a.rect.forEach((v, n) => expect(v).toBeCloseTo(before.rect[n], 3));
      expect(a.fontSize).toBe(fontSize);
      const committed = (await page
        .getByRole("button", { name: "Move text", exact: true })
        .boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const)
        expect(committed[key]).toBeCloseTo(geometry[key], 1);
      if (i < 2) {
        await page
          .getByRole("button", { name: "Edit text", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", { name: "Text on PDF", exact: true }),
        ).toBeVisible();
      }
    }
  });
}

for (const { content, fontFamily } of [
  { content: "Keep this text steady.", fontFamily: undefined },
  { content: "বাংলা লেখা", fontFamily: undefined },
  { content: "Keep this text steady.", fontFamily: "roboto" },
  { content: "বাংলা লেখা", fontFamily: "notoserifbengali" },
]) {
  test(`text ink stays in place after Done: ${content} (${fontFamily || "default"})`, async ({
    page,
  }, info) => {
    await start(page, 24, content, fontFamily);
    const clip = (await page.locator("[data-text-editor]").boundingBox())!;
    const ink = async () => {
      const png = await page.screenshot({ clip, scale: "css", caret: "hide" });
      return page.evaluate(async (data) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(data)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width,
          top = canvas.height,
          right = 0,
          bottom = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (
              pixels[i] < 100 &&
              pixels[i + 1] < 140 &&
              pixels[i + 2] > 120 &&
              pixels[i + 2] < 220
            ) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        return { left, top, right, bottom };
      }, Array.from(png));
    };
    const before = await ink();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator("[data-text-editor]")).toHaveCount(0);
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-page="0"] > canvas',
      )!;
      if (canvas.width < 2) return false;
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 100 &&
          data[i + 1] < 140 &&
          data[i + 2] > 120 &&
          data[i + 2] < 220
        )
          return true;
      return false;
    });
    const after = await ink();
    await info.attach("ink-position", {
      body: JSON.stringify({ before, after }),
      contentType: "application/json",
    });
    for (const edge of ["left", "top", "right", "bottom"] as const)
      expect(Math.abs(before[edge] - after[edge])).toBeLessThanOrEqual(2);
  });
}

test("Done does not enlarge a small resized text box to the selection hit target", async ({
  page,
}) => {
  await start(page, 6, "Hi");
  const draft = await page.evaluate(() => window.pdfweld.state().textDraft!);
  const geometry = await page.evaluate(
    () => window.pdfweld.state().info!.pages[0],
  );
  const factor =
    (await page.locator('[data-page="0"]').boundingBox())!.width /
    geometry.width;
  const handle = (await page
    .getByRole("button", { name: "Resize text", exact: true })
    .boundingBox())!;
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + (20 - (draft.rect[2] - draft.rect[0])) * factor,
    y + (12 - (draft.rect[3] - draft.rect[1])) * factor,
    { steps: 8 },
  );
  await page.mouse.up();
  const before = (await page.locator("[data-text-editor]").boundingBox())!;
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const element = page.getByRole("button", { name: "Move text", exact: true });
  await expect(element).toBeVisible();
  const after = (await element.boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(after[key]).toBeCloseTo(before[key], 1);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(page.locator("[data-text-editor]")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const repeated = (await element.boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(repeated[key]).toBeCloseTo(before[key], 1);
});
