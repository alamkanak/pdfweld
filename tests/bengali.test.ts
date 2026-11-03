import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";
import { registerTextFont } from "../src/lib/text-font";

test("Bengali text shapes, embeds its font, and survives restyle, undo, resize, and export", async () => {
  registerTextFont(
    new Uint8Array(readFileSync("public/fonts/NotoSansBengali.ttf")),
  );
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 400]);
  const engine = new PDFEngine();
  engine.open(await pdf.save(), "Bangla.pdf");
  const text = "বাংলা ভাষায় লিখুন — পরীক্ষা";
  engine.addMark({
    tool: "text",
    page: 0,
    rect: [40, 40, 500, 160],
    text,
    color: "#202123",
    width: 24,
    opacity: 1,
    author: "Test",
  });
  const count = (subject: PDFEngine) => {
    const rendered = subject.render(0, 1, [40, 40, 500, 160]);
    let ink = 0;
    for (let i = 0; i < rendered.pixels.length; i += 4)
      if (rendered.pixels[i] < 180) ink++;
    return ink;
  };
  expect(count(engine)).toBeGreaterThan(1200);
  const id = engine.details(0).annotations[0].id;
  engine.action({
    type: "annotation-style",
    page: 0,
    id,
    text: "বাংলা পরীক্ষা",
    color: "#123456",
    fontSize: 30,
  });
  expect(engine.details(0).annotations[0].fontSize).toBe(30);
  engine.action({ type: "undo" });
  expect(engine.details(0).annotations[0].text).toBe(text);
  engine.action({
    type: "annotation-transform",
    page: 0,
    id,
    rect: [40, 40, 550, 180],
  });
  const saved = new PDFEngine();
  saved.open(engine.save(), "Exported.pdf");
  expect(saved.details(0).annotations[0].text).toBe(text);
  expect(count(saved)).toBeGreaterThan(1200);
  const page = saved.require().loadPage(0);
  try {
    let embedded = false;
    page
      .getAnnotations()[0]
      .getObject()
      .get("AP", "N", "Resources", "Font")
      .forEach((font) => {
        if (
          font
            .get("DescendantFonts", 0, "FontDescriptor", "FontFile2")
            .isStream()
        )
          embedded = true;
      });
    expect(embedded).toBe(true);
  } finally {
    page.destroy();
  }
});
