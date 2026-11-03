import { test, expect } from "@playwright/test";

test("command palette uses arrows, scrolls selection, filters, and opens with Enter", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog", {
    name: "Find your flow",
    exact: true,
  });
  const input = menu.getByRole("combobox");
  const options = menu.getByRole("option");
  await expect(input).toBeFocused();
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await input.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await expect(options.last()).toBeInViewport();
  await expect(input).toBeInViewport();
  await expect(input).toBeFocused();
  await input.fill("compress");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(
    page
      .getByTestId("tool-workspace")
      .getByRole("heading", { name: "Compress PDF", exact: true }),
  ).toBeVisible();
});

test("command palette handles empty results, IME composition, and editor commands", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog", {
    name: "Find your flow",
    exact: true,
  });
  const input = menu.getByRole("combobox");
  const initial = await input.getAttribute("aria-activedescendant");
  await input.dispatchEvent("keydown", { key: "ArrowDown", isComposing: true });
  await expect(input).toHaveAttribute("aria-activedescendant", initial!);
  await input.fill("zzzzzzzzzz");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(0);
  await input.fill("rectangle");
  await input.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.pdfweld.state().tool))
    .toBe("rectangle");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("Escape closes the command palette when appearance settings were already open", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(() => window.pdfweld.openSample());
  await page
    .getByRole("button", { name: "Tool settings and color", exact: true })
    .click();
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog", {
    name: "Find your flow",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
