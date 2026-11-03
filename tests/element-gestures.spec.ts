import { test, expect, type Page, type Locator } from "@playwright/test";

async function prepare(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    await window.pdfweld.action({ type: "blank", at: 0 });
    await window.pdfweld.state().mark({
      tool: "text",
      page: 0,
      rect: [60, 90, 340, 250],
      text: "Keep this text size while the box wraps onto several lines. More words for wrapping.",
      color: "#29372f",
      width: 18,
      opacity: 1,
      author: "Test",
    });
  });
  const element = page.getByRole("button", { name: "Move text", exact: true });
  await expect(element).toBeVisible();
  return element;
}
async function annotation(page: Page) {
  return page.evaluate(
    async () => (await window.pdfweld.engine.call("details", 0)).annotations[0],
  );
}
async function drag(
  page: Page,
  target: Locator,
  dx: number,
  dy: number,
  release = true,
) {
  const rect = (await target.boundingBox())!;
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  if (release) await page.mouse.up();
}

test("resizing wraps the live text at a fixed font size and commits only once", async ({
  page,
}, info) => {
  const element = await prepare(page);
  await element.click();
  const factor =
    (await page.locator('[data-page="0"]').boundingBox())!.width / 595;
  const before = await annotation(page);
  const revision = await page.evaluate(() => window.pdfweld.state().revision);
  await page.evaluate(() => window.pdfweld.metrics.start());
  await drag(
    page,
    page.getByRole("button", { name: "Resize text", exact: true }),
    -120 * factor,
    0,
    false,
  );
  const preview = page.locator("[data-text-preview]");
  await expect(preview).toBeVisible();
  const live = await preview.evaluate((node) => {
    const input = node.querySelector("textarea")!;
    const previousHeight = input.style.height;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = previousHeight;
    return {
      size: parseFloat(getComputedStyle(node).fontSize),
      lines: contentHeight / parseFloat(getComputedStyle(input).lineHeight),
      width: node.clientWidth,
    };
  });
  expect(live.size).toBeCloseTo(18 * factor, 1);
  expect(live.lines).toBeGreaterThanOrEqual(4);
  expect(live.width).toBeLessThan(175 * factor);
  expect(await page.evaluate(() => window.pdfweld.state().revision)).toBe(
    revision,
  );
  expect((await annotation(page)).fontSize).toBe(before.fontSize);
  await page.screenshot({
    path: `test-results/${info.project.name}-live-text-wrap.png`,
  });
  const performance = await page.evaluate(() =>
    window.pdfweld.metrics.stop("Live fixed-size text resizing"),
  );
  expect(performance.inputSamples).toBeGreaterThanOrEqual(10);
  expect(performance.inputP95).toBeLessThan(8.33);
  await info.attach("text-resize-performance", {
    body: JSON.stringify(performance, null, 2),
    contentType: "application/json",
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await annotation(page)).rect[2] - (await annotation(page)).rect[0],
    )
    .toBeLessThan(175);
  expect((await annotation(page)).fontSize).toBe(18);
  expect(await page.evaluate(() => window.pdfweld.state().revision)).toBe(
    revision + 1,
  );
});

test("rapid drags are retained while an earlier PDF operation is busy", async ({
  page,
}) => {
  const element = await prepare(page);
  const before = await annotation(page);
  const factor =
    (await page.locator('[data-page="0"]').boundingBox())!.width / 595;
  await page.evaluate(() =>
    window.pdfweld.state().set({ busy: "Updating document…" }),
  );
  for (let i = 0; i < 3; i++) await drag(page, element, 15, 12);
  expect((await annotation(page)).rect).toEqual(before.rect);
  await page.evaluate(() => window.pdfweld.state().set({ busy: "" }));
  await expect
    .poll(async () => (await annotation(page)).rect[0])
    .toBeCloseTo(before.rect[0] + 45 / factor, 0);
  await expect
    .poll(async () => (await annotation(page)).rect[1])
    .toBeCloseTo(before.rect[1] + 36 / factor, 0);
  expect(
    await page.evaluate(() => window.pdfweld.state().textDraft),
  ).toBeNull();
});

test("the floating move control drags the element without losing pointer capture", async ({
  page,
}) => {
  const element = await prepare(page);
  await element.click();
  const before = await annotation(page);
  await drag(
    page,
    page.getByRole("button", { name: "Drag text", exact: true }),
    30,
    35,
  );
  await expect
    .poll(async () => (await annotation(page)).rect[1])
    .toBeGreaterThan(before.rect[1] + 10);
  expect(
    await page.evaluate(() => window.pdfweld.state().textDraft),
  ).toBeNull();
});

test("an interrupted drag cancels cleanly and the next drag still works", async ({
  page,
}) => {
  const element = await prepare(page);
  const before = await annotation(page);
  await drag(page, element, 35, 40, false);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  expect((await annotation(page)).rect).toEqual(before.rect);
  await drag(page, element, 25, 30);
  await expect
    .poll(async () => (await annotation(page)).rect[1])
    .toBeGreaterThan(before.rect[1] + 10);
});

test("text stays editable while its move and resize controls change the draft", async ({
  page,
}) => {
  const element = await prepare(page);
  await element.click();
  const before = await annotation(page);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Text on PDF", exact: true });
  await input.fill(
    "An editable sentence that should wrap inside the smaller box.",
  );
  await drag(
    page,
    page.getByRole("button", { name: "Drag text", exact: true }),
    25,
    30,
  );
  await expect(input).toBeFocused();
  const moved = await page.evaluate(
    () => window.pdfweld.state().textDraft!.rect,
  );
  expect(moved[0]).toBeGreaterThan(before.rect[0]);
  expect((await annotation(page)).rect).toEqual(before.rect);
  const fontSize = await input.evaluate(
    (node) => getComputedStyle(node).fontSize,
  );
  await drag(
    page,
    page.getByRole("button", { name: "Resize text", exact: true }),
    -45,
    20,
    false,
  );
  await expect(input).toHaveCSS("font-size", fontSize);
  await page.mouse.up();
  await input.press("End");
  await input.pressSequentially(" Still editing.");
  await page
    .getByRole("button", { name: "Text size and color", exact: true })
    .click();
  const appearance = page.getByRole("region", {
    name: "Appearance",
    exact: true,
  });
  await appearance.getByLabel("Text size (pt)", { exact: true }).fill("22");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await annotation(page)).fontSize).toBe(22);
  expect((await annotation(page)).text).toContain("Still editing.");
  expect((await annotation(page)).rect[0]).toBeCloseTo(moved[0], 1);
});

test("editing immediately after a drag uses the committed position", async ({
  page,
}) => {
  const element = await prepare(page);
  const before = await annotation(page);
  await drag(page, element, 35, 25);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Text on PDF", exact: true }),
  ).toBeVisible();
  const committed = await annotation(page);
  const draft = await page.evaluate(
    () => window.pdfweld.state().textDraft!.rect,
  );
  expect(draft).toEqual(committed.rect);
  expect(draft[0]).toBeGreaterThan(before.rect[0] + 10);
});

test("the first drag dismisses appearance settings and still moves the element", async ({
  page,
}) => {
  const element = await prepare(page);
  await element.click();
  const before = await annotation(page);
  await page
    .getByRole("button", { name: "Text size and color", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Appearance", exact: true })
    .getByLabel("Text size (pt)", { exact: true })
    .fill("22");
  // The phone popover can cover the center; drag the exposed left edge.
  const box = (await element.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 33, box.y + 50, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole("region", { name: "Appearance", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await annotation(page)).rect[0])
    .toBeGreaterThan(before.rect[0] + 10);
  expect((await annotation(page)).fontSize).toBe(22);
});
