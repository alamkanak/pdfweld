import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";

test("export burns only signatures, keeps other annotations and form fields, and leaves recovery editable", () => {
  const engine = new PDFEngine();
  engine.open(
    new Uint8Array(readFileSync("public/field-notes.pdf")),
    "Forms.pdf",
  );
  engine.action({
    type: "fill",
    page: 3,
    field: 0,
    value: "Still interactive",
  });
  for (const page of [0, 3])
    engine.addMark({
      tool: "image",
      page,
      rect: [40, 200, 280, 260],
      image: new Uint8Array(readFileSync("tests/fixtures/signature.png")),
      text: "Signature",
      color: "#29372f",
      width: 2,
      opacity: 1,
      author: "Test",
    });
  for (const page of [1, 3])
    engine.addMark({
      tool: "note",
      page,
      rect: [40, 100, 64, 124],
      text: "Keep this comment",
      color: "#29372f",
      width: 2,
      opacity: 1,
      author: "Test",
    });
  engine.addMark({
    tool: "signature",
    page: 3,
    rect: [300, 200, 480, 260],
    points: [
      [310, 220],
      [360, 250],
      [400, 210],
      [470, 245],
    ],
    signatureGroup: "export-test",
    color: "#29372f",
    width: 2,
    opacity: 0.45,
    author: "Test",
  });
  const before = engine.render(3, 1);
  const source = engine.details(3).annotations;
  const exported = new PDFEngine();
  exported.open(engine.save(), "Export.pdf");
  expect(exported.details(0).annotations).toHaveLength(0);
  expect(exported.details(1).annotations.map((a) => a.text)).toEqual([
    "Keep this comment",
  ]);
  expect(exported.details(3).annotations.map((a) => a.text)).toEqual([
    "Keep this comment",
  ]);
  expect(exported.details(3).fields).toHaveLength(3);
  expect(exported.details(3).fields[0].value).toBe("Still interactive");
  expect(
    exported.require().getTrailer().get("Root", "AcroForm", "Fields").length,
  ).toBe(3);
  const after = exported.render(3, 1);
  let different = 0;
  before.pixels.forEach((value, index) => {
    if (Math.abs(value - after.pixels[index]) > 2) different++;
  });
  expect(different).toBe(0);
  expect(engine.details(3).annotations).toEqual(source);
  const recovery = new PDFEngine();
  recovery.open(engine.saveEditable(), "Recovery.pdf");
  expect(recovery.details(3).annotations).toHaveLength(3);
  const extracted = new PDFEngine();
  extracted.open(engine.extract([3]), "Extracted.pdf");
  expect(extracted.details(0).annotations.map((a) => a.text)).toEqual([
    "Keep this comment",
  ]);
  expect(extracted.details(0).fields[0].value).toBe("Still interactive");
  engine.action({ type: "undo" });
  expect(engine.details(3).annotations).toHaveLength(2);
  engine.action({ type: "redo" });
  expect(engine.details(3).annotations).toHaveLength(3);
});
