import { test, expect, type Page } from "@playwright/test";

async function assertReadableUI(page: Page) {
  const issues = await page.evaluate(() => {
    const small: string[] = [],
      corners: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode,
        parent = node.parentElement;
      if (
        !parent ||
        !node.textContent?.trim() ||
        parent.closest("svg,script,style,[data-page]")
      )
        continue;
      const range = document.createRange();
      range.selectNode(node);
      if (
        !range.getBoundingClientRect().width ||
        !range.getBoundingClientRect().height
      )
        continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (parseFloat(style.fontSize) < 12)
        small.push(
          `${node.textContent.trim().slice(0, 60)}: ${style.fontSize}`,
        );
    }
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (
        !el.getClientRects().length ||
        el.closest("svg,[data-page]") ||
        el.classList.contains("rounded-full")
      )
        continue;
      const style = getComputedStyle(el);
      for (const radius of [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomLeftRadius,
        style.borderBottomRightRadius,
      ])
        if (parseFloat(radius) !== 0 && parseFloat(radius) !== 8)
          corners.push(`${el.tagName}.${el.className}: ${radius}`);
    }
    return { small, corners };
  });
  expect(issues.small).toEqual([]);
  expect(issues.corners).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

async function seedLibrary(page: Page, recent = true) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(async (recent) => {
    await window.pdfweld.openSample();
    const bytes = await window.pdfweld.engine.call("save");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pdfweld-library");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("files", "readwrite"),
          store = tx.objectStore("files");
        store.clear();
        const now = Date.now();
        store.put({
          id: "old",
          name: "Archive.pdf",
          bytes,
          pages: 4,
          updated: now - 45 * 86400000,
        });
        if (recent) {
          store.put({
            id: "newest",
            name: "Project notes.pdf",
            bytes,
            pages: 4,
            updated: now - 3600000,
          });
          store.put({
            id: "earlier",
            name: "Design review.pdf",
            bytes,
            pages: 4,
            updated: now - 3 * 86400000,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    window.pdfweld.state().set({ info: null, panel: null, dirty: false });
  }, recent);
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Archive.pdf", exact: true }),
  ).toBeVisible();
}

test("Recent documents filters and orders the library, supports search, and can return to all files", async ({
  page,
}, info) => {
  await seedLibrary(page);
  await assertReadableUI(page);
  const sizes = await page
    .getByRole("navigation", { name: "Library navigation" })
    .locator("button")
    .evaluateAll((nodes) => [
      ...new Set(nodes.map((n) => getComputedStyle(n).fontSize)),
    ]);
  expect(sizes).toEqual(["14px"]);
  const top = await page.getByTestId("document-gallery").boundingBox();
  expect(top!.y).toBeLessThan(230);
  await page.screenshot({
    path: `test-results/${info.project.name}-gallery.png`,
  });
  const recent = page.getByRole("button", {
    name: "Recent documents",
    exact: true,
  });
  await recent.click();
  await expect(recent).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Recent documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Archive.pdf", exact: true }),
  ).not.toBeVisible();
  expect(
    await page
      .locator("[data-document-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-document-id")),
      ),
  ).toEqual(["newest", "earlier"]);
  await page.getByRole("textbox", { name: "Find a document" }).fill("Design");
  await expect(
    page.getByRole("button", { name: "Open Design review.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Project notes.pdf", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("textbox", { name: "Find a document" }).fill("");
  await page.getByRole("button", { name: "My studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Archive.pdf", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "About PDFWeld", exact: true })
    .click();
  await assertReadableUI(page);
});

test("Recent documents has an actionable empty state", async ({ page }) => {
  await seedLibrary(page, false);
  await page
    .getByRole("button", { name: "Recent documents", exact: true })
    .click();
  await expect(
    page.getByText("No recent documents.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open a PDF", exact: true }).last(),
  ).toBeVisible();
  await assertReadableUI(page);
});

test("compact controls fit a 320px phone without shrinking text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await assertReadableUI(page);
  const headerFits = () =>
    page.locator("header button").evaluateAll((nodes) =>
      nodes.every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width === 0 || (rect.left >= 0 && rect.right <= innerWidth);
      }),
    );
  expect(await headerFits()).toBe(true);
  await page.evaluate(() => window.pdfweld.openSample());
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  await assertReadableUI(page);
  expect(await headerFits()).toBe(true);
  await expect(
    page.getByRole("button", { name: "More annotation tools", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "More annotation tools", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Your toolkit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toBeVisible();
  await assertReadableUI(page);
});

test("editor panels and dialogs respect the typography, radius, and compact layout rules", async ({
  page,
  isMobile,
}, info) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  await assertReadableUI(page);
  const header = await page.locator("header").boundingBox();
  expect(header!.height).toBeLessThanOrEqual(56);
  const geometry = await page.evaluate(() => {
    const viewport = document
      .querySelector('[data-testid="document-viewport"]')!
      .getBoundingClientRect();
    const paper = document
      .querySelector('[data-page="0"]')!
      .getBoundingClientRect();
    return { top: paper.top - viewport.top, left: paper.left - viewport.left };
  });
  expect(geometry.top).toBeLessThanOrEqual(16);
  expect(geometry.left).toBeLessThanOrEqual(16);
  if (!isMobile) {
    await expect(
      page.getByText("Saved in your library", { exact: true }),
    ).toHaveCSS("font-size", "12px");
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-compact-workspace.png`,
  });
  for (const panel of [
    "tools",
    "comments",
    "forms",
    "properties",
    "attachments",
    "layers",
    "outline",
    "search",
  ] as const) {
    await page.evaluate(
      (panel) => window.pdfweld.state().set({ panel }),
      panel,
    );
    await expect(page.getByRole("complementary")).toBeVisible();
    await assertReadableUI(page);
  }
  for (const dialog of [
    "commands",
    "shortcuts",
    "organize",
    "benchmark",
    "signature",
  ]) {
    await page.evaluate(
      (dialog) => window.pdfweld.state().set({ dialog, panel: null }),
      dialog,
    );
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertReadableUI(page);
  }
});

test("Home and Recent put the last opened document first across views and reloads", async ({
  page,
  isMobile,
}) => {
  await seedLibrary(page);
  const ids = () =>
    page
      .locator("[data-document-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-document-id")),
      );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  expect(await ids()).toEqual(["newest", "earlier", "old"]);
  await page
    .getByRole("button", { name: "Open Archive.pdf", exact: true })
    .click();
  await expect(page.getByTestId("document-viewport")).toBeVisible();
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await expect.poll(ids).toEqual(["old", "newest", "earlier"]);
  await page
    .getByRole("button", { name: "Recent documents", exact: true })
    .click();
  await expect.poll(ids).toEqual(["old", "newest", "earlier"]);
  if (!isMobile) {
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    expect(await ids()).toEqual(["old", "newest", "earlier"]);
    await page.getByRole("button", { name: "List view", exact: true }).click();
    expect(await ids()).toEqual(["old", "newest", "earlier"]);
  }
  const newestId = await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Z last opened.pdf");
    return window.pdfweld.state().id;
  });
  await page
    .getByRole("button", { name: "Back to studio", exact: true })
    .click();
  await expect.poll(ids).toEqual([newestId, "old", "newest", "earlier"]);
  await page.reload();
  await page.waitForFunction(() => !!window.pdfweld);
  await expect.poll(ids).toEqual([newestId, "old", "newest", "earlier"]);
  await page
    .getByRole("button", { name: "Recent documents", exact: true })
    .click();
  expect(await ids()).toEqual([newestId, "old", "newest", "earlier"]);
});
