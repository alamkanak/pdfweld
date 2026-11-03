import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Tool } from "../src/lib/types";

async function prepare(page: Page, tool: Tool) {
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
  await element.click();
  if (tool !== "text")
    await expect
      .poll(() => element.locator("canvas").getAttribute("width"))
      .not.toBe("1");
  return element;
}

for (const tool of ["text", "signature", "image"] as Tool[]) {
  test(`${tool} drag survives capture loss and short or long presses`, async ({
    page,
  }) => {
    const element = await prepare(page, tool);
    const factor =
      (await page.locator('[data-page="0"]').boundingBox())!.width / 595;
    for (const hold of [0, 250, 900]) {
      const before = await page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0].rect,
      );
      const box = (await element.boundingBox())!;
      const x = box.x + box.width * 0.25,
        y = box.y + box.height * 0.5;
      await element.evaluate((node) => {
        node.addEventListener(
          "gotpointercapture",
          (event) => {
            (window as unknown as { releaseDrag: () => void }).releaseDrag =
              () =>
                node.releasePointerCapture((event as PointerEvent).pointerId);
          },
          { once: true },
        );
      });
      await page.mouse.move(x, y);
      await page.mouse.down();
      if (hold) await page.waitForTimeout(hold);
      await page.mouse.move(x + 5, y + 5);
      await page.evaluate(() =>
        (window as unknown as { releaseDrag: () => void }).releaseDrag(),
      );
      await page.mouse.move(x + 15, y + 20, { steps: 3 });
      await page.mouse.up();
      await expect
        .poll(async () =>
          page.evaluate(
            async () =>
              (await window.pdfweld.engine.call("details", 0)).annotations[0]
                .rect[0],
          ),
        )
        .toBeCloseTo(before[0] + 15 / factor, 0);
      await expect
        .poll(async () =>
          page.evaluate(
            async () =>
              (await window.pdfweld.engine.call("details", 0)).annotations[0]
                .rect[1],
          ),
        )
        .toBeCloseTo(before[1] + 20 / factor, 0);
      await expect
        .poll(async () => (await element.boundingBox())!.x)
        .toBeCloseTo(box.x + 15, 0);
    }
    expect(
      await page.evaluate(() => window.pdfweld.state().textDraft),
    ).toBeNull();
  });

  test(`${tool} stays visibly moved while the PDF page is still repainting`, async ({
    page,
  }) => {
    const element = await prepare(page, tool);
    const before = await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations[0].rect,
    );
    await page.evaluate(() => {
      const client = window.pdfweld.engine;
      const original = client.call.bind(client);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      (window as unknown as { releasePaint: () => void }).releasePaint =
        release;
      client.call = (async (...args: Parameters<typeof original>) => {
        const result = await original(...args);
        if (args[0] === "render" && args[3] === undefined) await gate;
        return result;
      }) as typeof client.call;
    });
    const box = (await element.boundingBox())!;
    const factor =
      (await page.locator('[data-page="0"]').boundingBox())!.width / 595;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 100 * factor, { steps: 3 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await window.pdfweld.engine.call("details", 0)).annotations[0]
              .rect[1],
        ),
      )
      .toBeGreaterThan(before[1] + 80);
    const moved = (await element.boundingBox())!;
    // Deselecting while a slow repaint is pending must keep the moved pixels
    // visible too; selection controls do not own the temporary appearance.
    const paper = (await page.locator('[data-page="0"]').boundingBox())!;
    await page.mouse.click(paper.x + 5, moved.y + 5);
    await expect(element).toHaveAttribute("aria-pressed", "false");
    const png = await page.screenshot({
      clip: {
        x: moved.x + 2,
        y: moved.y + 2,
        width: moved.width - 4,
        height: moved.height - 4,
      },
      scale: "css",
    });
    const visibleInk = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 110 && pixels[i + 1] < 130 && pixels[i + 2] < 110)
          ink++;
      return ink;
    }, Array.from(png));
    await page.evaluate(() =>
      (window as unknown as { releasePaint: () => void }).releasePaint(),
    );
    expect(visibleInk).toBeGreaterThan(30);
  });
}
