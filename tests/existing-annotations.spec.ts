import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function fixture(locked = false) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([440, 660]);
  const annotations = pdf.context.obj([]);
  for (const [index, subtype] of [
    "StrikeOut",
    "Highlight",
    "Underline",
    "Squiggly",
    "Square",
    "Circle",
    "Text",
    "Redact",
  ].entries()) {
    const top = 600 - index * 55;
    const object = pdf.context.obj({
      Type: "Annot",
      Subtype: subtype,
      Rect: [60, top - 20, 260, top],
      C: [0.8, 0.2, 0.1],
      F: locked ? 132 : 4,
      Contents: `Original ${subtype}`,
      T: "Original author",
      ...(["StrikeOut", "Highlight", "Underline", "Squiggly"].includes(subtype)
        ? { QuadPoints: [60, top, 260, top, 60, top - 20, 260, top - 20] }
        : {}),
    });
    annotations.push(pdf.context.register(object));
  }
  page.node.set(pdf.context.obj("Annots"), annotations);
  return Array.from(await pdf.save());
}

test("imported markup can be selected and deleted directly on the page, with undo and export", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    (bytes) =>
      window.pdfweld.state().open(new Uint8Array(bytes), "Existing markup.pdf"),
    await fixture(),
  );
  for (const [index, label] of [
    "strikethrough",
    "highlight",
    "underline",
    "squiggly underline",
    "rectangle",
    "ellipse",
    "comment",
    "redaction",
  ].entries()) {
    const element = page.getByRole("button", {
      name: `Select ${label}`,
      exact: true,
    });
    await element.click();
    const remove = page.getByRole("button", {
      name: `Delete ${label}`,
      exact: true,
    });
    await expect(remove).toBeVisible();
    if (index === 0) {
      await element.press("Delete");
      await expect(element).toHaveCount(0);
      await page.evaluate(() => window.pdfweld.action({ type: "undo" }));
      await element.click();
    }
    await remove.click();
    await expect(element).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await window.pdfweld.engine.call("details", 0)).annotations.length,
        ),
      )
      .toBe(7 - index);
  }
  await page.evaluate(async () => {
    const bytes = await window.pdfweld.engine.call("save");
    await window.pdfweld.state().open(bytes, "Cleaned.pdf");
  });
  expect(
    await page.evaluate(
      async () => (await window.pdfweld.engine.call("details", 0)).annotations,
    ),
  ).toHaveLength(0);
});

test("locked imported annotations are selectable but cannot be deleted", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.pdfweld);
  await page.evaluate(
    (bytes) =>
      window.pdfweld.state().open(new Uint8Array(bytes), "Locked markup.pdf"),
    await fixture(true),
  );
  const element = page.getByRole("button", {
    name: "Select strikethrough",
    exact: true,
  });
  await element.click();
  await expect(
    page.getByRole("button", { name: "Delete strikethrough", exact: true }),
  ).toBeDisabled();
  await element.press("Delete");
  expect(
    await page.evaluate(
      async () => (await window.pdfweld.engine.call("details", 0)).annotations,
    ),
  ).toHaveLength(8);
});
