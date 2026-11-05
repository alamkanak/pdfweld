import { expect, test, type Page } from "@playwright/test";
import { findFont } from "../src/lib/font-catalog";

async function draft(page: Page, text = "বাংলা ভাষায় লিখুন", navigate = true) {
  if (navigate) await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async () => {
    await window.pdfweld.openSample();
    await window.pdfweld.action({ type: "blank", at: 0 });
    window.pdfweld.state().set({ textSize: 24, color: "#3259a4" });
  });
  await page.getByRole("button", { name: "Add text (T)", exact: true }).click();
  const box = (await page.locator('[data-page="0"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.width * 0.15);
  await page
    .getByRole("textbox", { name: "Text on PDF", exact: true })
    .fill(text);
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await page.getByRole("button", { name: "Font", exact: true }).click();
}

test("one font picker filters languages and applies Google Fonts to editing and export", async ({
  page,
}, info) => {
  const downloads: string[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/fonts/google/")) downloads.push(request.url());
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      external.push(request.url());
  });
  await draft(page);
  expect(downloads).toEqual([]);
  await page.getByRole("combobox", { name: "Search fonts" }).fill("bangla");
  await expect(
    page.getByRole("listbox", { name: "Fonts" }).getByRole("option"),
  ).toHaveCount(2);
  await page.getByRole("combobox", { name: "Font language" }).click();
  await page
    .getByRole("listbox", { name: "Font languages", exact: true })
    .getByRole("option", { name: "Bengali / বাংলা", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Noto Serif Bengali", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Font", exact: true }),
  ).toHaveText("Noto Serif Bengali");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Text on PDF", exact: true }),
  ).toHaveCSS("font-family", /PDFWeldFontnotoserifbengali/);
  expect(new Set(downloads.map((url) => url.split("/").pop())).size).toBe(1);
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Noto Serif Bengali", exact: true }),
  ).toContainText("Available offline");
  await expect(page.locator("[data-font-preview]")).toHaveText(
    "বাংলা ভাষায় লিখুন",
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-font-picker.png`,
  });
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0]
            ?.fontFamily,
      ),
    )
    .toBe("notoserifbengali");
  const restored = await page.evaluate(async () => {
    const saved = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(saved, "Google fonts.pdf");
    return (await window.pdfweld.engine.call("details", 0)).annotations[0];
  });
  expect(restored.fontFamily).toBe("notoserifbengali");
  expect(restored.text).toBe("বাংলা ভাষায় লিখুন");
  expect(external).toEqual([]);
});

test.describe("font download retry", () => {
  test.use({ serviceWorkers: "block" });
  test("download failure stays inside the picker and Retry keeps the text draft", async ({
    page,
  }) => {
    const font = findFont("roboto")!;
    await draft(page, "Keep my text while the font downloads");
    await page.route(`**/fonts/google/${font.file}`, (route) => route.abort());
    await page.getByRole("combobox", { name: "Search fonts" }).fill("Roboto");
    await page.getByRole("option", { name: "Roboto", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Could not load this font",
    );
    expect(
      await page.evaluate(() => window.pdfweld.state().textDraft?.fontFamily),
    ).toBe("helvetica");
    await expect(
      page.getByRole("textbox", { name: "Text on PDF", exact: true }),
    ).toHaveValue("Keep my text while the font downloads");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.unroute(`**/fonts/google/${font.file}`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Font", exact: true }),
    ).toHaveText("Roboto");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});

test("keyboard selection works on a narrow screen and Escape only collapses the picker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await draft(page, "Keyboard font selection");
  const search = page.getByRole("combobox", { name: "Search fonts" });
  await search.fill("Lora");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(
    page.getByRole("button", { name: "Font", exact: true }),
  ).toHaveText("Lora");
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await search.press("Escape");
  await expect(page.getByRole("listbox", { name: "Fonts" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Appearance", exact: true }),
  ).toBeVisible();
  const box = (await page.locator("[data-font-picker]").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});

test("language menu uses the app theme and previews native scripts over English document text", async ({
  page,
}, info) => {
  await draft(page, "English document text");
  const language = page.getByRole("combobox", {
    name: "Font language",
    exact: true,
  });
  expect(await language.evaluate((element) => element.tagName)).toBe("BUTTON");
  await language.press("ArrowDown");
  const menu = page.getByRole("listbox", {
    name: "Font languages",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await page
    .getByRole("option", { name: "All languages", exact: true })
    .press("b");
  const bengali = menu.getByRole("option", {
    name: "Bengali / বাংলা",
    exact: true,
  });
  await expect(bengali).toBeFocused();
  await bengali.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("listbox", { name: "Fonts", exact: true }),
  ).toBeVisible();
  for (const [label, sample] of [
    ["Arabic / العربية", "مرحبا بالعالم"],
    ["Hindi / हिन्दी", "हिन्दी में लिखें"],
    ["Bengali / বাংলা", "বাংলা ভাষায় লিখুন"],
  ]) {
    await language.click();
    await menu.getByRole("option", { name: label, exact: true }).click();
    await expect(page.locator("[data-font-preview]")).toHaveText(sample);
    for (const specimen of await page.locator("[data-font-specimen]").all())
      await expect(specimen).toHaveText(sample);
  }
  await language.click();
  await page.screenshot({
    path: `test-results/${info.project.name}-themed-language-menu.png`,
  });
  await menu
    .getByRole("option", { name: "All languages", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search fonts" })
    .fill("Noto Sans Bengali");
  await page
    .getByRole("option", { name: "Noto Sans Bengali", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Font", exact: true }),
  ).toHaveText("Noto Sans Bengali");
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await expect(page.locator("[data-font-preview]")).toHaveText(
    "বাংলা ভাষায় লিখুন",
  );
  await expect(
    page.getByRole("textbox", { name: "Text on PDF", exact: true }),
  ).toHaveValue("English document text");
  await page.screenshot({
    path: `test-results/${info.project.name}-native-font-specimens.png`,
  });
});

test("downloaded fonts remain selectable offline after reload", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "WebKit's service-worker offline automation varies by host.",
  );
  await draft(page, "Offline font selection");
  await page.getByRole("combobox", { name: "Search fonts" }).fill("Roboto");
  await page.getByRole("option", { name: "Roboto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Font", exact: true }),
  ).toHaveText("Roboto");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller && !!window.pdfweld,
  );
  await context.setOffline(true);
  await page.reload();
  await draft(page, "Use this font offline", false);
  await page.getByRole("combobox", { name: "Search fonts" }).fill("Roboto");
  await expect(
    page.getByRole("option", { name: "Roboto", exact: true }),
  ).toContainText("Available offline");
  await page.getByRole("option", { name: "Roboto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Font", exact: true }),
  ).toHaveText("Roboto");
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 0)).annotations[0]
            ?.fontFamily,
      ),
    )
    .toBe("roboto");
});
