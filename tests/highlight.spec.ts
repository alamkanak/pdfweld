import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";

async function prepare(
  page: Page,
  blank = false,
  firstLine = "Alpha beta gamma delta epsilon.",
) {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([440, 660]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  if (!blank) {
    sheet.drawText(firstLine, {
      x: 40,
      y: 550,
      size: 14,
      font,
    });
    sheet.drawText("Second line has selected words.", {
      x: 40,
      y: 525,
      size: 14,
      font,
    });
    sheet.drawText("Another paragraph stays clear.", {
      x: 40,
      y: 440,
      size: 14,
      font,
    });
  }
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    (bytes) =>
      window.pdfweld.state().open(new Uint8Array(bytes), "Text selection.pdf"),
    Array.from(await pdf.save()),
  );
  await page
    .getByRole("button", { name: "Highlight (M)", exact: true })
    .click();
  await expect(
    page.locator('[data-page="0"] [data-text-selection]'),
  ).toHaveCount(1);
}

async function points(
  page: Page,
  firstLine: number,
  start: number,
  lastLine: number,
  end: number,
) {
  const details = await page.evaluate(() =>
    window.pdfweld.engine.call("details", 0),
  );
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  const factor = box.width / 440;
  const point = (quad: number[], fraction: number) => ({
    x:
      box.x +
      ((quad[0] + quad[4]) / 2 +
        (fraction * (quad[2] + quad[6] - quad[0] - quad[4])) / 2) *
        factor,
    y: box.y + ((quad[1] + quad[5]) / 2) * factor,
  });
  return {
    start: point(details.lines[firstLine].chars[start].quad, 0.1),
    end: point(details.lines[lastLine].chars[end - 1].quad, 0.9),
  };
}
async function select(
  page: Page,
  first: number,
  start: number,
  last: number,
  end: number,
) {
  const p = await points(page, first, start, last, end);
  await page.mouse.move(p.start.x, p.start.y);
  await page.mouse.down();
  await page.mouse.move(p.end.x, p.end.y, { steps: 12 });
  const selection = await page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  await page.mouse.up();
  return selection;
}
async function annotations(page: Page) {
  return page.evaluate(
    async () => (await window.pdfweld.engine.call("details", 0)).annotations,
  );
}

test("dragging selects only the requested words, without a rectangular area or paragraph highlight", async ({
  page,
}, info) => {
  await prepare(page);
  await page.evaluate(() => window.pdfweld.metrics.start());
  expect(await select(page, 0, 6, 0, 16)).toBe("beta gamma");
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0].text).toBe("beta gamma");
  const performance = await page.evaluate(() =>
    window.pdfweld.metrics.stop("Native text highlight selection"),
  );
  expect(performance.inputSamples).toBeGreaterThan(5);
  expect(performance.inputP95).toBeLessThan(8.33);
  await info.attach("highlight-performance", {
    body: JSON.stringify(performance),
    contentType: "application/json",
  });
  const bytes = await page.evaluate(async () =>
    Array.from(await window.pdfweld.engine.call("save")),
  );
  const exported = new PDFEngine();
  exported.open(new Uint8Array(bytes), "Highlight.pdf");
  const sourcePage = exported.require().loadPage(0);
  try {
    const quads = sourcePage.getAnnotations()[0].getQuadPoints();
    const line = exported.details(0).lines[0];
    expect(quads).toHaveLength(1);
    expect(quads[0][0]).toBeCloseTo(line.chars[6].quad[0], 2);
    expect(quads[0][2]).toBeCloseTo(line.chars[15].quad[2], 2);
  } finally {
    sourcePage.destroy();
  }
});

test("repeated selections and taps never stack highlights on the same text", async ({
  page,
}) => {
  await prepare(page);
  await select(page, 0, 6, 0, 16);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  const revision = await page.evaluate(() => window.pdfweld.state().revision);
  await select(page, 0, 6, 0, 16);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.isCollapsed))
    .toBe(true);
  expect(await annotations(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.pdfweld.state().revision)).toBe(
    revision,
  );
  const p = await points(page, 0, 8, 0, 9);
  for (let i = 0; i < 6; i++) await page.mouse.click(p.start.x, p.start.y);
  expect(await annotations(page)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
  expect(await annotations(page)).toHaveLength(0);
});

test("multi-line selection makes line quads and skips the paragraph gap", async ({
  page,
}) => {
  await prepare(page);
  await select(page, 0, 17, 1, 11);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0].text).toBe("delta epsilon.\nSecond line");
  const bytes = await page.evaluate(async () =>
    Array.from(await window.pdfweld.engine.call("save")),
  );
  const pdf = new PDFEngine();
  pdf.open(new Uint8Array(bytes), "Lines.pdf");
  const sheet = pdf.require().loadPage(0);
  try {
    expect(sheet.getAnnotations()[0].getQuadPoints()).toHaveLength(2);
  } finally {
    sheet.destroy();
  }
});

test("a native selection can be adjusted and applied with the touch-friendly selection button", async ({
  page,
  isMobile,
}) => {
  await prepare(page);
  await page.locator('[data-text-line="0"]').evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.querySelector('[data-text-char="6"]')!.firstChild!, 0);
    range.setEnd(node.querySelector('[data-text-char="9"]')!.firstChild!, 1);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const button = page.getByRole("button", {
    name: "Highlight selection",
    exact: true,
  });
  if (isMobile) await button.tap();
  else await button.click();
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0].text).toBe("beta");
});

test("tapping text or dragging blank/scanned pages creates no highlight", async ({
  page,
}) => {
  await prepare(page);
  const p = await points(page, 0, 8, 0, 9);
  await page.mouse.click(p.start.x, p.start.y);
  expect(await annotations(page)).toHaveLength(0);
  await prepare(page, true);
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 100, { steps: 10 });
  await page.mouse.up();
  expect(await annotations(page)).toHaveLength(0);
});

test("the toolbar highlighter applies an existing text selection", async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  expect(await select(page, 0, 6, 0, 16)).toBe("beta gamma");
  expect(await annotations(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Highlight (M)", exact: true })
    .click();
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0].text).toBe("beta gamma");
});

test("highlighting the word Signature remains an ordinary deletable highlight on export", async ({
  page,
}) => {
  await prepare(page, false, "Signature beta gamma delta epsilon.");
  await select(page, 0, 0, 0, 9);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Select highlight", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete highlight", exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(async () =>
    Array.from(await window.pdfweld.engine.call("save")),
  );
  const saved = new PDFEngine();
  saved.open(new Uint8Array(bytes), "Highlighted.pdf");
  expect(saved.details(0).annotations.map((a) => a.type)).toEqual([
    "Highlight",
  ]);
});

test("finger long-press selects a word and the selection action applies it", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== "chromium" || !isMobile,
    "Native long-press injection uses the Chromium touch protocol.",
  );
  // Device emulation uses the host's desktop engine. Only exercise native
  // long-press when that engine exposes it for an ordinary HTML paragraph.
  await page.setContent(
    '<meta name="viewport" content="width=device-width,initial-scale=1"><p id="native-probe" style="font:24px Arial;margin:60px 20px;user-select:text">Alpha beta gamma.</p>',
  );
  const probe = await page.locator("#native-probe").evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild!, 6);
    range.setEnd(node.firstChild!, 10);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...probe, id: 1 }],
  });
  await page.waitForTimeout(900);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  test.skip(
    (await page.evaluate(() => window.getSelection()?.toString().trim())) !==
      "beta",
    "The host desktop engine does not expose native mobile long-press selection; selection and touch application are covered separately.",
  );
  await prepare(page);
  const p = await points(page, 0, 8, 0, 9);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: p.start.x, y: p.start.y, id: 1 }],
  });
  await page.waitForTimeout(900);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe("beta");
  expect(await annotations(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Highlight selection", exact: true })
    .tap();
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0].text).toBe("beta");
});
