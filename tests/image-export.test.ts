import { test, expect } from "vitest";
import { PDFDocument, degrees, PDFName, PDFNumber } from "pdf-lib";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";
import mupdf from "mupdf";

test.each(["Photo", "Signature"])(
  "repairs legacy %s image appearances without changing their pixels",
  async (label) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 200]);
    const engine = new PDFEngine();
    engine.open(await pdf.save(), "Legacy.pdf");
    engine.mutate("Legacy image", () => {
      const page = engine.require().loadPage(0);
      const image = new mupdf.Image(
        new Uint8Array(readFileSync("tests/fixtures/signature.png")),
      );
      try {
        const annotation = page.createAnnotation("Stamp");
        annotation.setRect([20, 80, 260, 140]);
        annotation.setContents(label);
        annotation.setStampImage(image);
        annotation.update();
        page.update();
      } finally {
        image.destroy();
        page.destroy();
      }
    });
    const before = engine.render(0, 1);
    const output = new PDFEngine();
    output.open(engine.save(), "Export.pdf");
    const after = output.render(0, 1);
    expect(after.pixels).toEqual(before.pixels);
    expect(output.details(0).annotations).toHaveLength(
      label === "Signature" ? 0 : 1,
    );
    if (label === "Photo") {
      const page = output.require().loadPage(0);
      try {
        expect(
          page.getAnnotations()[0].getObject().get("AP", "N", "BBox").asJS(),
        ).toEqual([0, 0, 240, 60]);
      } finally {
        page.destroy();
      }
    }
    expect(engine.details(0).annotations).toHaveLength(1);
  },
);

for (const rotation of [0, 90, 180, 270]) {
  for (const userUnit of [1, 2]) {
    test(`image export preserves rendered proportions on a ${rotation} degree page with unit ${userUnit}`, async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([400, 500]);
      page.setCropBox(20, 30, 360, 440);
      page.setRotation(degrees(rotation));
      page.node.set(PDFName.of("UserUnit"), PDFNumber.of(userUnit));
      const engine = new PDFEngine();
      engine.open(await pdf.save(), "Image.pdf");
      engine.addMark({
        tool: "image",
        page: 0,
        rect: [20, 40, 200, 85],
        text: "Image",
        image: new Uint8Array(readFileSync("tests/fixtures/signature.png")),
        color: "#29372f",
        width: 2,
        opacity: 1,
        author: "Test",
      });
      const id = engine.details(0).annotations[0].id;
      engine.action({
        type: "annotation-transform",
        page: 0,
        id,
        rect: [40, 150, 280, 210],
      });
      const sourcePage = engine.require().loadPage(0);
      try {
        const object = sourcePage.getAnnotations()[0].getObject();
        const raw = object.get("Rect").asJS() as number[];
        const bbox = object.get("AP", "N", "BBox").asJS() as number[];
        expect(bbox[2] - bbox[0]).toBeCloseTo(raw[2] - raw[0], 3);
        expect(bbox[3] - bbox[1]).toBeCloseTo(raw[3] - raw[1], 3);
      } finally {
        sourcePage.destroy();
      }
      const before = engine.render(0, 1);
      const exported = new PDFEngine();
      exported.open(engine.save(), "Export.pdf");
      expect(exported.details(0).annotations[0].rect).toEqual(
        engine.details(0).annotations[0].rect,
      );
      const after = exported.render(0, 1);
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
      let different = 0;
      for (let i = 0; i < before.pixels.length; i++)
        if (Math.abs(before.pixels[i] - after.pixels[i]) > 2) different++;
      expect(different).toBe(0);
    });
  }
}
