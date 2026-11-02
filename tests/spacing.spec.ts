import { test, expect, type Locator, type Page } from "@playwright/test";

async function openHome(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
}
async function edges(pane: Locator, section: Locator) {
  const content = await pane.evaluate((el) => ({
    left: el.getBoundingClientRect().left + el.clientLeft,
    width: el.clientWidth,
  }));
  const rect = (await section.boundingBox())!;
  expect(rect.x).toBeCloseTo(content.left, 0);
  expect(rect.width).toBeCloseTo(content.width, 0);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

test("pane dividers reach both edges, section headings breathe, and cards fit their content", async ({
  page,
  isMobile,
}, info) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const pane = page.getByTestId("library-pane");
  const controls = pane.getByLabel("Document controls", { exact: true });
  const tools = pane.getByRole("region", { name: "Start with a tool" });
  await edges(pane, controls);
  await edges(pane, tools);
  const row = tools.locator("[data-pane-section-header]");
  const rowBox = (await row.boundingBox())!;
  const heading = (await tools
    .getByRole("heading", { name: "Start with a tool" })
    .boundingBox())!;
  expect(heading.y - rowBox.y).toBeGreaterThanOrEqual(12);
  const all = tools.getByRole("button", { name: "All tools", exact: true });
  const action = (await all.boundingBox())!;
  expect(action.height).toBeGreaterThanOrEqual(40);
  expect(
    await all.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
  ).toBeGreaterThanOrEqual(12);
  const input = pane.getByRole("textbox", { name: "Find a document" });
  const field = (await input.boundingBox())!;
  const icon = (await input.locator("..").locator("svg").boundingBox())!;
  expect(icon.y + icon.height / 2).toBeCloseTo(field.y + field.height / 2, 0);
  if (!isMobile) {
    expect(await pane.getByRole("table", { name: "Documents" }).count()).toBe(
      0,
    );
    const cards = await tools
      .getByRole("button", { name: /^Start / })
      .evaluateAll((nodes) =>
        nodes.map((el) => {
          const copy = el.querySelector("strong + span")!;
          return {
            lines:
              copy.getBoundingClientRect().height /
              parseFloat(getComputedStyle(copy).lineHeight),
            height: el.getBoundingClientRect().height,
            bottom:
              el.getBoundingClientRect().bottom -
              copy.getBoundingClientRect().bottom,
          };
        }),
      );
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect(card.lines).toBe(1);
      expect(card.height).toBeLessThan(80);
      expect(card.bottom).toBeLessThanOrEqual(14);
    }
  } else await edges(pane, pane.locator("footer"));
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-spacing-home.png`,
    animations: "disabled",
  });
});

test("catalogue controls stay available while browsing and filters fit a 320px screen", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openHome(page);
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: "All tools", exact: true })
    .click();
  const catalogue = page.getByTestId("home-tools");
  const search = catalogue.getByLabel("Search home tools");
  const y = (await search.boundingBox())!.y;
  await catalogue
    .getByRole("button", { name: "Start Crop PDF", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(search).toBeInViewport();
  expect((await search.boundingBox())!.y).toBe(y);
  for (const row of await catalogue.locator("[data-pane-toolbar]").all())
    await edges(catalogue, row);
  const categories = catalogue.getByRole("navigation", {
    name: "Tool categories",
  });
  await categories
    .getByRole("button", { name: "Inspect", exact: true })
    .click();
  await expect(catalogue.getByRole("button", { name: /^Start / })).toHaveCount(
    1,
  );
  await categories.getByRole("button", { name: "All", exact: true }).click();
  await search.fill("compress");
  await expect(
    catalogue.getByRole("button", { name: "Start Compress PDF", exact: true }),
  ).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-spacing-catalogue.png`,
    animations: "disabled",
  });
});

test("tool options have one consistent gap after the heading", async ({
  page,
}, info) => {
  await openHome(page);
  await page
    .getByRole("button", { name: "Start Combine files", exact: true })
    .click();
  const task = page.getByTestId("tool-workspace");
  await edges(task, task.locator("header"));
  const options = task.getByRole("group", { name: "Options", exact: true });
  await options.scrollIntoViewIfNeeded();
  const legend = (await options.locator("legend").boundingBox())!;
  const first = (await options
    .getByLabel("Output filename", { exact: true })
    .locator("..")
    .boundingBox())!;
  expect(first.x).toBeCloseTo(legend.x, 0);
  expect(first.y - legend.y - legend.height).toBeCloseTo(12, 0);
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-spacing-options.png`,
    animations: "disabled",
  });
});
