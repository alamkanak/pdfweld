import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await expect(page.getByTestId("document-viewport")).toBeVisible();
}
async function record(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const row = await new Promise<any>((resolve, reject) => {
      const req = indexedDB.open("pdfweld-library");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          get = db.transaction("files").objectStore("files").get(id);
        get.onsuccess = () => {
          resolve(get.result);
          db.close();
        };
        get.onerror = () => reject(get.error);
      };
    });
    const blob =
      row?.thumbnail instanceof Blob
        ? row.thumbnail
        : row?.thumbnail
          ? new Blob([new Uint8Array(row.thumbnail)], { type: "image/png" })
          : undefined;
    const bytes = blob
      ? new Uint8Array(await blob.arrayBuffer())
      : new Uint8Array();
    let width = 0,
      height = 0;
    if (blob) {
      const image = await createImageBitmap(blob);
      width = image.width;
      height = image.height;
      image.close();
    }
    return {
      updated: row?.updated,
      size: bytes.length,
      type: blob?.type,
      width,
      height,
      signature: Array.from(bytes.slice(0, 8)),
      hash: Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ).join(","),
    };
  }, id);
}

test("read-only imports get real thumbnails and older records are backfilled without switching the editor's PDF", async ({
  page,
}, info) => {
  await open(page);
  const id = await page.evaluate(() => window.pdfweld.state().id);
  const first = await record(page, id);
  expect(first.type).toBe("image/png");
  expect(first.width).toBeLessThanOrEqual(320);
  expect(first.height).toBeGreaterThan(300);
  expect(first.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const main = await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("extract", [3]);
    const protectedBytes = await window.pdfweld.engine.call("save", {
      encrypt: "aes-256",
      "user-password": "test",
      "owner-password": "owner",
    });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pdfweld-library");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("files", "readwrite"),
          store = tx.objectStore("files");
        store.put({
          id: "legacy",
          name: "Legacy.pdf",
          bytes,
          pages: 1,
          updated: 123456789,
        });
        store.put({
          id: "locked",
          name: "Protected.pdf",
          bytes: protectedBytes,
          pages: 4,
          updated: Date.now(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const d = await window.pdfweld.engine.call("info");
    return { name: d.name, pages: d.pages.length };
  });
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  const legacy = page.getByRole("img", {
    name: "Legacy.pdf thumbnail",
    exact: true,
  });
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await expect(legacy).toBeVisible();
  await expect
    .poll(() =>
      legacy.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(100);
  const cached = await record(page, "legacy");
  expect(cached.size).toBeGreaterThan(1000);
  expect(cached.updated).toBe(123456789);
  expect(cached.hash).not.toBe(first.hash);
  await expect(
    page.locator('[data-document-id="locked"] [data-thumbnail-state="locked"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const d = await window.pdfweld.engine.call("info");
      return { name: d.name, pages: d.pages.length };
    }),
  ).toEqual(main);
  await page
    .getByRole("button", { name: "Recent documents", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Field Notes.pdf thumbnail", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Protected.pdf", exact: true })
    .click();
  const unlock = page.getByRole("dialog", {
    name: "Unlock document",
    exact: true,
  });
  await unlock.getByLabel("Document password", { exact: true }).fill("test");
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect
    .poll(async () => (await record(page, "locked")).size)
    .toBeGreaterThan(1000);
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Protected.pdf thumbnail", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-desktop-library.png`,
  });
  await page.reload();
  await page.waitForFunction(() => !!window.pdfweld);
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Legacy.pdf thumbnail", exact: true }),
  ).toBeVisible();
  expect((await record(page, "legacy")).hash).toBe(cached.hash);
});

test("edited previews refresh on recovery saves and survive reopening", async ({
  page,
}) => {
  await open(page);
  const id = await page.evaluate(() => window.pdfweld.state().id),
    before = await record(page, id);
  await page.evaluate(() =>
    window.pdfweld.action({
      type: "watermark",
      pages: [0],
      text: "PREVIEW UPDATE",
    }),
  );
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your workspace", exact: true }),
  ).toBeVisible();
  const edited = await record(page, id);
  expect(edited.hash).not.toBe(before.hash);
  expect(edited.size).toBeGreaterThan(1000);
  await page
    .getByRole("button", { name: "Open Field Notes.pdf", exact: true })
    .click();
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  await expect
    .poll(async () => (await record(page, id)).updated)
    .toBeGreaterThan(edited.updated);
  await expect
    .poll(async () => (await record(page, id)).size)
    .toBeGreaterThan(1000);
  expect((await record(page, id)).hash).toBe(edited.hash);
});

test("desktop library and editor panes resize, reset, and remember widths without rasterizing every drag frame", async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, "Desktop pane widths are replaced by phone sheets.");
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  const library = page.getByRole("complementary", {
    name: "Library",
    exact: true,
  });
  const homeResize = page.getByRole("separator", {
    name: "Resize Library pane width",
    exact: true,
  });
  await homeResize.press("Shift+ArrowRight");
  await expect.poll(async () => (await library.boundingBox())!.width).toBe(256);
  await open(page);
  const pane = page.getByRole("complementary", { name: "Pages", exact: true });
  const splitter = page.getByRole("separator", {
    name: "Resize Pages pane width",
    exact: true,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !window.pdfweld.cache().running &&
          window.pdfweld.cache().queued === 0,
      ),
    )
    .toBe(true);
  const before = (await pane.boundingBox())!.width,
    canvas = await page.locator('[data-page="0"]').boundingBox(),
    box = (await splitter.boundingBox())!;
  await page.evaluate(() => window.pdfweld.metrics.start());
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + 80, { steps: 20 });
  expect(
    (await page.locator('[data-page="0"]').boundingBox())!.width,
  ).toBeCloseTo(canvas!.width, 2);
  const report = await page.evaluate(() =>
    window.pdfweld.metrics.stop("Pane resizing"),
  );
  expect(report.renders).toBe(0);
  expect(report.inputSamples).toBeGreaterThan(10);
  expect(report.inputP95).toBeLessThan(8.33);
  await info.attach("pane-resize-performance", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBe(before + 100);
  await expect
    .poll(
      async () => (await page.locator('[data-page="0"]').boundingBox())!.width,
    )
    .toBeLessThan(canvas!.width - 80);
  expect(await page.evaluate(() => window.pdfweld.state().dirty)).toBe(false);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page
    .getByRole("button", { name: "Page thumbnails", exact: true })
    .click();
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBe(before + 100);
  await page.screenshot({
    path: `test-results/${info.project.name}-resized-editor.png`,
  });
  await splitter.dblclick();
  await expect.poll(async () => (await pane.boundingBox())!.width).toBe(224);
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await expect.poll(async () => (await library.boundingBox())!.width).toBe(256);
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Documents" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.getByRole("table", { name: "Documents" })).toBeVisible();
});

test("phone sheets have adjustable heights and retain them when reopened", async ({
  page,
  isMobile,
}, info) => {
  test.skip(
    !isMobile,
    "Phone sheet geometry is tested on touch/mobile profiles.",
  );
  await open(page);
  await page.getByRole("button", { name: "Show pages", exact: true }).click();
  const pane = page.getByRole("complementary", { name: "Pages", exact: true });
  const handle = page.getByRole("separator", {
    name: "Resize Pages pane height",
    exact: true,
  });
  const before = (await pane.boundingBox())!.height,
    box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 64, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await pane.boundingBox())!.height)
    .toBe(before + 64);
  await handle.press("ArrowDown");
  await expect
    .poll(async () => (await pane.boundingBox())!.height)
    .toBe(before + 56);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Show pages", exact: true }).click();
  await expect
    .poll(async () => (await pane.boundingBox())!.height)
    .toBe(before + 56);
  expect(await page.evaluate(() => window.pdfweld.state().dirty)).toBe(false);
  await page.screenshot({
    path: `test-results/${info.project.name}-resized-sheet.png`,
  });
});
