import { test, expect, type Page } from "@playwright/test";
import { PDFEngine } from "../src/lib/engine";

async function blank(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    await window.pdfweld.action({ type: "blank", at: 0 });
  });
  await expect
    .poll(() => page.locator('[data-page="0"] > canvas').getAttribute("width"))
    .not.toBe("1");
}
async function addText(page: Page) {
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.width * 0.15);
  const text = page.getByRole("textbox", { name: "Text on PDF", exact: true });
  await expect(text).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return text;
}

test("Bengali is editable on the page, uses shared appearance controls, and exports real glyphs", async ({
  page,
}, info) => {
  await blank(page);
  const text = await addText(page);
  const revision = await page.evaluate(() => window.pdfweld.state().revision);
  await text.dispatchEvent("compositionstart");
  await text.fill("বাংলা ভাষায় লিখুন — পরীক্ষা");
  await text.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(text).toBeVisible();
  expect(await page.evaluate(() => window.pdfweld.state().revision)).toBe(
    revision,
  );
  await text.dispatchEvent("compositionend");
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  const appearance = page.getByRole("region", {
    name: "Appearance",
    exact: true,
  });
  await appearance
    .getByRole("button", { name: "Use color #202123", exact: true })
    .click();
  await appearance
    .getByRole("spinbutton", { name: "Text size (pt)", exact: true })
    .fill("24");
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await expect(text).toHaveValue("বাংলা ভাষায় লিখুন — পরীক্ষা");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(text).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Bangla.pdf");
    const a = (await window.pdfweld.engine.call("details", 0)).annotations[0];
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
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 180) ink++;
    return { text: a.text, size: a.fontSize, ink };
  });
  expect(result.text).toBe("বাংলা ভাষায় লিখুন — পরীক্ষা");
  expect(result.size).toBe(24);
  expect(result.ink).toBeGreaterThan(1200);
  const element = page.getByRole("button", { name: "Move text", exact: true });
  await element.click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text on PDF" })
    .fill("নতুন বাংলা লেখা");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0].text,
      ),
    )
    .toBe("নতুন বাংলা লেখা");
  await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0].text,
      ),
    )
    .toBe(result.text);
  await page.screenshot({
    path: `test-results/${info.project.name}-inline-bengali.png`,
  });
});

test("appearance controls stay above overlapping text editors", async ({
  page,
}) => {
  await blank(page);
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.width * 0.15);
  const text = page.getByRole("textbox", { name: "Text on PDF", exact: true });
  await text.fill("Overlapping text");
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Appearance", exact: true })
    .getByRole("button", { name: "Use color #82b5d6", exact: true })
    .click();
  await expect(text).toHaveCSS("color", "rgb(130, 181, 214)");
});

test("text drafts cancel cleanly and ordinary Enter adds a line without a PDF operation", async ({
  page,
}) => {
  await blank(page);
  const text = await addText(page);
  await text.fill("First line");
  await text.press("End");
  await text.press("Enter");
  await text.pressSequentially("Second line");
  await expect(text).toHaveValue("First line\nSecond line");
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations.length,
    ),
  ).toBe(0);
  await text.press("Escape");
  await expect(text).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations.length,
    ),
  ).toBe(0);
});

test("Add text can place text over an image without dragging the image", async ({
  page,
}) => {
  await blank(page);
  await page.evaluate(async () => {
    const bytes = new Uint8Array(
      await (await fetch("/pdfweld/field-notes-cover.png")).arrayBuffer(),
    );
    await window.pdfweld.state().mark({
      tool: "image",
      image: bytes,
      page: 0,
      rect: [40, 40, 300, 240],
      text: "Image",
      color: "#29372f",
      width: 2,
      opacity: 1,
      author: "Test",
    });
  });
  await addText(page);
  const annotation = await page.evaluate(
    async () => (await window.pdfweld.engine.call("details", 0)).annotations[0],
  );
  expect(annotation.rect).toEqual([40, 40, 300, 240]);
  await page
    .getByRole("button", { name: "Cancel text editing", exact: true })
    .click();
});

test("clearing added text deletes it with undo, and phone text controls stay on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await blank(page);
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(box.x + box.width - 10, box.y + box.width * 0.2);
  const text = page.getByRole("textbox", { name: "Text on PDF", exact: true });
  await text.fill("Keep this text");
  const done = page.getByRole("button", { name: "Done", exact: true });
  const button = (await done.boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(0);
  expect(button.x + button.width).toBeLessThanOrEqual(320);
  await done.click();
  await expect(text).toHaveCount(0);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await text.fill("");
  await done.click();
  await expect(text).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations.length,
      ),
    )
    .toBe(0);
  await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0]?.text,
      ),
    )
    .toBe("Keep this text");
});

test("the save shortcut includes uncommitted text and switching documents keeps a recovery copy", async ({
  page,
}) => {
  await blank(page);
  const text = await addText(page);
  await text.fill("Save directly from typing");
  const exported = page.waitForEvent("download");
  await text.press("ControlOrMeta+s");
  await exported;
  await expect(text).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().busy))
    .toBe("");
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await text.fill("Keep my unfinished edit");
  const stored = await page.evaluate(async () => {
    const id = window.pdfweld.state().id;
    const data = new Uint8Array(
      await (await fetch("/pdfweld/field-notes.pdf")).arrayBuffer(),
    );
    await window.pdfweld.state().open(data, "Another.pdf");
    return new Promise<number[]>((resolve, reject) => {
      const request = indexedDB.open("pdfweld-library");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const record = db
          .transaction("files", "readonly")
          .objectStore("files")
          .get(id);
        record.onsuccess = () => {
          resolve(Array.from(record.result.bytes));
          db.close();
        };
        record.onerror = () => {
          reject(record.error);
          db.close();
        };
      };
    });
  });
  const saved = new PDFEngine();
  saved.open(new Uint8Array(stored), "Recovery.pdf");
  expect(saved.details(0).annotations[0].text).toBe("Keep my unfinished edit");
  expect(await page.evaluate(() => window.pdfweld.state().info?.name)).toBe(
    "Another.pdf",
  );
});

test("document operations commit pending text before changing page geometry", async ({
  page,
}) => {
  await blank(page);
  const text = await addText(page);
  await text.fill("Keep text when rotating");
  await page.evaluate(() =>
    window.pdfweld.action({ type: "rotate", pages: [0], angle: 90 }),
  );
  await expect(text).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.pdfweld.engine.call("details", 0)).annotations[0].text,
    ),
  ).toBe("Keep text when rotating");
});

test("browser Back saves pending text before returning to Home", async ({
  page,
}) => {
  await blank(page);
  const id = await page.evaluate(() => {
    history.pushState(null, "", "/pdfweld/tools/compress-pdf/");
    return window.pdfweld.state().id;
  });
  const text = await addText(page);
  await text.fill("Keep text when going back");
  await page.goBack();
  await expect
    .poll(() => page.evaluate(() => !!window.pdfweld.state().info))
    .toBe(false);
  const bytes = await page.evaluate(
    (id) =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("pdfweld-library");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const file = db
            .transaction("files", "readonly")
            .objectStore("files")
            .get(id);
          file.onsuccess = () => {
            resolve(Array.from(file.result.bytes));
            db.close();
          };
          file.onerror = () => {
            reject(file.error);
            db.close();
          };
        };
      }),
    id,
  );
  const saved = new PDFEngine();
  saved.open(new Uint8Array(bytes), "Recovery.pdf");
  expect(saved.details(0).annotations[0].text).toBe(
    "Keep text when going back",
  );
});

test("comments keep their editor while annotation colors stay in the shared appearance panel", async ({
  page,
}) => {
  await blank(page);
  await page.evaluate(() =>
    window.pdfweld.state().mark({
      tool: "note",
      page: 0,
      rect: [60, 90, 84, 114],
      text: "Original comment",
      color: "#f2ca68",
      width: 2,
      opacity: 1,
      author: "Test",
    }),
  );
  await page.getByLabel("Edit Text annotation", { exact: true }).click();
  const comment = page.getByRole("dialog", {
    name: "Edit comment",
    exact: true,
  });
  await comment.getByLabel("Comment", { exact: true }).fill("Updated comment");
  await expect(comment.locator('input[type="color"]')).toHaveCount(0);
  await comment
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0]?.text,
      ),
    )
    .toBe("Updated comment");
});

test("tool setup is one responsive flow, image previews fill frames, and scrollbars use the theme", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await expect(
    page.getByRole("img", { name: "Field Notes sample PDF cover" }).first(),
  ).toHaveCSS("object-fit", "cover");
  await page.goto("/pdfweld/tools/images-to-pdf/");
  await page.waitForFunction(() => !!window.pdfweld);
  const task = page.getByTestId("tool-workspace");
  await expect(
    task.getByRole("button", { name: "Choose files", exact: true }),
  ).toHaveCount(1);
  await expect(task.getByRole("separator")).toHaveCount(0);
  await task
    .getByLabel("Source files", { exact: true })
    .setInputFiles("tests/fixtures/signature.png");
  const preview = task.getByRole("img", {
    name: "signature.png preview",
    exact: true,
  });
  await expect(preview).toHaveCSS("object-fit", "cover");
  const settings = task.getByRole("region", {
    name: "Tool setup",
    exact: true,
  });
  await expect(
    settings.getByLabel("Output filename", { exact: true }),
  ).toBeVisible();
  const style = await settings.evaluate((element) => {
    const scroller = element.parentElement!.parentElement!;
    // Some macOS Firefox configurations report "none" even for an explicit
    // thin scrollbar when the OS uses hidden overlay scrollbars.
    const probe = document.createElement("div");
    probe.style.scrollbarWidth = "thin";
    document.body.append(probe);
    const nativeThin =
      getComputedStyle(probe).getPropertyValue("scrollbar-width");
    probe.remove();
    return {
      width: getComputedStyle(scroller).getPropertyValue("scrollbar-width"),
      color: getComputedStyle(scroller).getPropertyValue("scrollbar-color"),
      dark: getComputedStyle(scroller).colorScheme,
      nativeThin,
    };
  });
  expect(style.dark).toBe("dark");
  if (style.width) expect(style.width).toBe(style.nativeThin);
  if (style.color) expect(style.color).toContain("85, 87, 95");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/${info.project.name}-unified-image-tool.png`,
  });
});
