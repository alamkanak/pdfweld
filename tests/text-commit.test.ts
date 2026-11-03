import { test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";
import type { Rect } from "../src/lib/types";

test.each([6, 12, 18, 32, 72])(
  "committing %s pt text preserves the requested rectangle and font through edits and export",
  async (fontSize) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const engine = new PDFEngine();
    engine.open(await pdf.save(), "Text.pdf");
    const rect: Rect = [60, 90, 360, 260];
    engine.addMark({
      tool: "text",
      page: 0,
      rect,
      text: "Keep the text box exactly where it was placed.",
      width: fontSize,
      color: "#29372f",
      opacity: 1,
      author: "Test",
    });
    for (let i = 0; i < 3; i++) {
      const a = engine.details(0).annotations[0];
      expect(a.rect).toEqual(rect);
      expect(a.fontSize).toBe(fontSize);
      engine.action({
        type: "annotation-style",
        page: 0,
        id: a.id,
        rect,
        fontSize,
        text: a.text,
      });
    }
    const restored = new PDFEngine();
    restored.open(engine.save(), "Export.pdf");
    expect(restored.details(0).annotations[0].rect).toEqual(rect);
    expect(restored.details(0).annotations[0].fontSize).toBe(fontSize);
  },
);

test("removing a legacy text border preserves its outer rectangle", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const engine = new PDFEngine();
  engine.open(await pdf.save(), "Legacy.pdf");
  engine.addMark({
    tool: "text",
    page: 0,
    rect: [60, 90, 360, 260],
    text: "Legacy text",
    width: 18,
    color: "#29372f",
    opacity: 1,
    author: "Test",
  });
  engine.mutate("Legacy border", () => {
    const page = engine.require().loadPage(0);
    try {
      const a = page.getAnnotations()[0];
      a.setBorderWidth(12);
      a.update();
      page.update();
    } finally {
      page.destroy();
    }
  });
  const before = engine.details(0).annotations[0];
  engine.action({
    type: "annotation-style",
    page: 0,
    id: before.id,
    fontSize: 24,
  });
  expect(engine.details(0).annotations[0].rect).toEqual(before.rect);
});
