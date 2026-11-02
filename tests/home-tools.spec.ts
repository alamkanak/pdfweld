import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { PDFEngine } from "../src/lib/engine";
const sample = readFileSync("public/field-notes.pdf");
async function home(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
}
async function choose(page: Page, label: string) {
  if (
    !(await page
      .getByRole("button", { name: `Start ${label}`, exact: true })
      .isVisible())
  )
    await page
      .getByRole("navigation", { name: "Library navigation" })
      .getByRole("button", { name: "All tools", exact: true })
      .click();
  await page
    .getByRole("button", { name: `Start ${label}`, exact: true })
    .click();
  await expect(page.getByTestId("tool-workspace")).toBeVisible();
}
async function upload(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose files", exact: true }).click();
  await (await picker).setFiles(files);
  await expect(page.locator("[data-task-file]")).toHaveCount(files.length);
  await expect(page.getByText(/Checking…/)).toHaveCount(0);
}
const pdf = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: sample,
});
function inspect(bytes: Uint8Array) {
  const doc = new PDFEngine();
  doc.open(bytes, "Result.pdf");
  return doc;
}
async function download(
  page: Page,
  button: import("@playwright/test").Locator,
) {
  const event = page.waitForEvent("download");
  await button.click();
  return readFileSync((await (await event).path())!);
}
async function noEditor(page: Page) {
  expect(await page.evaluate(() => window.pdfweld.state().info)).toBeNull();
  await expect(page.getByTestId("document-viewport")).toHaveCount(0);
}
async function fits(page: Page) {
  const issues = await page.evaluate(() => {
    const small: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (
        !el ||
        !walker.currentNode.textContent?.trim() ||
        el.closest("svg,script,style")
      )
        continue;
      if (
        el.getClientRects().length &&
        parseFloat(getComputedStyle(el).fontSize) < 12
      )
        small.push(el.textContent || "");
    }
    return {
      small,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(issues).toEqual({ small: [], overflow: false });
  expect((await page.locator("header").first().boundingBox())!.y).toBe(0);
}

test("home presents real tools, a searchable catalogue, and responsive task layouts", async ({
  page,
}, info) => {
  await home(page);
  await expect(
    page.getByRole("heading", { name: "Start with a tool" }),
  ).toBeVisible();
  await fits(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-home-tools.png`,
  });
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: "All tools", exact: true })
    .click();
  await expect(
    page.getByTestId("home-tools").getByRole("button", { name: /^Start / }),
  ).toHaveCount(21);
  await page.getByLabel("Search home tools").fill("split");
  await expect(
    page.getByTestId("home-tools").getByRole("button", { name: /^Start / }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Start Split PDF", exact: true })
    .click();
  await noEditor(page);
  await fits(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await fits(page);
  const action = await page
    .getByRole("button", { name: "Run Split PDF", exact: true })
    .boundingBox();
  expect(action!.x).toBeGreaterThanOrEqual(0);
  expect(action!.x + action!.width).toBeLessThanOrEqual(320);
});

test("compress downloads a valid copy without opening an editor or making external requests", async ({
  page,
}, info) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !/^(blob:|data:)/.test(r.url())
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await home(page);
  await choose(page, "Compress PDF");
  await upload(page, [pdf("Notes.pdf")]);
  await page
    .getByRole("button", { name: "Compress files", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 file ready", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-compress-result.png`,
  });
  const bytes = await download(
    page,
    page.getByRole("button", { name: "Download", exact: true }),
  );
  expect(bytes.length).toBeLessThanOrEqual(sample.length);
  expect(inspect(bytes).info().pages).toHaveLength(4);
  expect(inspect(bytes).text(0)).toContain("Spaces for");
  await noEditor(page);
  await fits(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("combine orders source files and selected pages, preserving forms and bookmarks", async ({
  page,
}, info) => {
  await home(page);
  await choose(page, "Combine files");
  await upload(page, [pdf("Cover.pdf"), pdf("Forms.pdf")]);
  await page.getByLabel("Pages from Cover.pdf", { exact: true }).fill("1-2");
  await page.getByLabel("Pages from Forms.pdf", { exact: true }).fill("4");
  await page
    .getByRole("button", { name: "Move Forms.pdf earlier", exact: true })
    .click();
  await page.getByLabel("Output filename", { exact: true }).fill("Packet");
  await fits(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-combine-files.png`,
  });
  await page
    .getByRole("button", { name: "Combine files", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 file ready", exact: true }),
  ).toBeVisible();
  const doc = inspect(
    await download(
      page,
      page.getByRole("button", { name: "Download", exact: true }),
    ),
  );
  expect(doc.info().pages).toHaveLength(3);
  expect(doc.details(0).fields).toHaveLength(3);
  expect(doc.text(1)).toContain("Spaces for");
  expect(doc.info().outline.map((b) => b.title)).toEqual([
    "Forms.pdf",
    "Cover.pdf",
  ]);
  await noEditor(page);
  await fits(page);
});

test("split exports multiple real PDFs in a worker-generated ZIP", async ({
  page,
}) => {
  await home(page);
  await choose(page, "Split PDF");
  await upload(page, [pdf("Notes.pdf")]);
  await page.getByLabel("Pages per file", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Run Split PDF", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 files ready", exact: true }),
  ).toBeVisible();
  const archive = unzipSync(
    await download(
      page,
      page.getByRole("button", { name: "Download all as ZIP", exact: true }),
    ),
  );
  expect(Object.keys(archive)).toEqual(["Notes-1-2.pdf", "Notes-3-4.pdf"]);
  for (const bytes of Object.values(archive))
    expect(inspect(bytes).info().pages).toHaveLength(2);
  expect(inspect(archive["Notes-3-4.pdf"]).details(1).fields).toHaveLength(3);
  await noEditor(page);
});

test("fill and sign starts from home, finds forms, and exports filled fields", async ({
  page,
  isMobile,
}, info) => {
  await home(page);
  await choose(page, "Fill & sign");
  await upload(page, [pdf("Form.pdf")]);
  await noEditor(page);
  await page
    .getByRole("button", { name: "Continue to Fill & sign", exact: true })
    .click();
  await expect(page.locator('[data-workspace-mode="fill-sign"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().page))
    .toBe(3);
  if (isMobile)
    await page
      .getByRole("button", { name: "Fill fields", exact: true })
      .click();
  const form = page.getByRole("complementary", {
    name: "Form fields",
    exact: true,
  });
  await expect(form).toBeVisible();
  const text = form.getByRole("textbox").first();
  await text.fill("Grace Hopper");
  await text.blur();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pdfweld.engine.call("details", 3)).fields[0].value,
      ),
    )
    .toBe("Grace Hopper");
  if (isMobile)
    await page
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
  const overlay = page.locator('[data-page="3"] input[type="text"]').first();
  // Unfocused widgets show the actual PDF appearance. Focus masks that
  // appearance with one opaque input, so values are never drawn twice.
  await expect(overlay).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await overlay.focus();
  await expect(overlay).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(overlay).toHaveCSS("background-color", "rgb(219, 234, 254)");
  await overlay.blur();
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Add your signature", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload signature image", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-fill-sign-home.png`,
  });
  const bytes = await download(
    page,
    page.getByRole("button", { name: "Save filled PDF", exact: true }),
  );
  expect(inspect(bytes).details(3).fields[0].value).toBe("Grace Hopper");
});

test("password retry and invalid input stay in the tool, and home commands launch tools", async ({
  page,
}) => {
  const protectedDoc = new PDFEngine();
  protectedDoc.open(new Uint8Array(sample), "Protected.pdf");
  const bytes = protectedDoc.save({
    encrypt: "aes-256",
    "user-password": "reader",
    "owner-password": "owner",
  });
  await home(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search tools and commands…").fill("compress");
  await page
    .getByRole("dialog", { name: "Find your flow" })
    .getByRole("button", { name: /Compress PDF/ })
    .click();
  await upload(page, [
    {
      name: "Locked.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Compress files", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Password for Locked.pdf").fill("wrong");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByText("Password required or not accepted.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Password for Locked.pdf").fill("owner");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Compress files", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove Locked.pdf", exact: true })
    .click();
  await upload(page, [
    {
      name: "Invalid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("invalid data"),
    },
  ]);
  await expect(
    page.getByText("Cannot read file", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Compress files", exact: true }),
  ).toBeDisabled();
  await noEditor(page);
});

test("image conversion can open its result and saved library files can feed a home tool", async ({
  page,
}) => {
  await home(page);
  await choose(page, "Images to PDF");
  await upload(page, [
    {
      name: "Signature.png",
      mimeType: "image/png",
      buffer: readFileSync("tests/fixtures/signature.png"),
    },
  ]);
  await page.getByLabel("Output filename", { exact: true }).fill("Marks.pdf");
  await page
    .getByLabel("Image page size", { exact: true })
    .selectOption("US Letter");
  await page
    .getByRole("button", { name: "Run Images to PDF", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 file ready", exact: true }),
  ).toBeVisible();
  await noEditor(page);
  const result = inspect(
    await download(
      page,
      page.getByRole("button", { name: "Download", exact: true }),
    ),
  );
  expect(result.info().pages).toHaveLength(1);
  expect(result.info().pages[0].width).toBe(612);
  await page.getByRole("button", { name: "Open result", exact: true }).click();
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  const id = await page.evaluate(() => window.pdfweld.state().id);
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await choose(page, "Compress PDF");
  await page
    .getByLabel("Choose a library document", { exact: true })
    .selectOption(id);
  await expect(
    page.getByRole("button", { name: "Compress files", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Compress files", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 file ready", exact: true }),
  ).toBeVisible();
  await noEditor(page);
  expect(
    await page.evaluate(
      async () => (await window.pdfweld.engine.call("info")).name,
    ),
  ).toBe("Marks.pdf");
});

test("cancelling local processing keeps source files and permits a clean retry", async ({
  page,
}) => {
  await home(page);
  await choose(page, "PDF to images");
  await upload(page, [
    {
      name: "Scan.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync("public/benchmark-scans.pdf"),
    },
  ]);
  await page.getByLabel("Resolution", { exact: true }).selectOption("3");
  await page
    .getByRole("button", { name: "Run PDF to images", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel processing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run PDF to images", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("[data-task-file]")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Pages", { exact: true }).fill("1");
  await page.getByLabel("Resolution", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Run PDF to images", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 file ready", exact: true }),
  ).toBeVisible();
  const bytes = await download(
    page,
    page.getByRole("button", { name: "Download", exact: true }),
  );
  expect(Array.from(bytes.slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  await noEditor(page);
});
