import { test, expect } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";
import { PDFEngine } from "../src/lib/engine";
import type { Mark, Tool, Rect } from "../src/lib/types";

test("resizing a text box preserves its font and the preview background preserves page content", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 300]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    color: rgb(0.2, 0.4, 0.7),
  });
  const engine = new PDFEngine();
  engine.open(await pdf.save(), "Background.pdf");
  engine.addMark({
    tool: "text",
    page: 0,
    rect: [30, 40, 320, 160],
    text: "Text wrapping must not resize the actual font.",
    width: 18,
    color: "#000000",
    opacity: 1,
    author: "Test",
  });
  const a = engine.details(0).annotations[0];
  const before = engine.info();
  const patch = engine.render(0, 1, a.rect, a.id);
  for (let i = 0; i < patch.pixels.length; i += 4) {
    expect(Math.abs(patch.pixels[i] - 51)).toBeLessThanOrEqual(1);
    expect(Math.abs(patch.pixels[i + 1] - 102)).toBeLessThanOrEqual(1);
    expect(Math.abs(patch.pixels[i + 2] - 179)).toBeLessThanOrEqual(1);
  }
  expect(engine.info().canUndo).toBe(before.canUndo);
  engine.action({
    type: "annotation-transform",
    page: 0,
    id: a.id,
    rect: [30, 40, 170, 200],
  });
  expect(engine.details(0).annotations[0].fontSize).toBe(18);
  const saved = new PDFEngine();
  saved.open(engine.save(), "Resized.pdf");
  expect(saved.details(0).annotations[0].fontSize).toBe(18);
  expect(saved.details(0).annotations[0].rect).toEqual([30, 40, 170, 200]);
  engine.action({ type: "undo" });
  expect(engine.details(0).annotations[0].rect).toEqual(a.rect);
});

test.each(["text", "image", "signature"] as Tool[])(
  "moves %s pixels, retains undo, and exports at the new position",
  async (tool) => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 500]);
    const engine = new PDFEngine();
    engine.open(await doc.save(), "Move.pdf");
    const mark: Mark = {
      tool,
      page: 0,
      rect: [40, 40, 220, 100],
      text: "Signature",
      width: tool === "text" ? 20 : 2,
      points: [
        [50, 60],
        [90, 80],
        [150, 45],
        [200, 75],
      ],
      color: "#29372f",
      opacity: 1,
      author: "Test",
      ...(tool === "image"
        ? {
            image: new Uint8Array(readFileSync("tests/fixtures/signature.png")),
          }
        : {}),
    };
    engine.addMark(mark);
    const original = engine.details(0).annotations[0];
    const next = original.rect.map((v, i) => v + (i % 2 ? 160 : 35)) as Rect;
    engine.action({
      type: "annotation-transform",
      page: 0,
      id: original.id,
      rect: next,
    });
    const moved = engine.details(0).annotations[0];
    moved.rect.forEach((v, i) => expect(v).toBeCloseTo(next[i], 3));
    const saved = new PDFEngine();
    saved.open(engine.save(), "Moved.pdf");
    const r = saved.render(0, 1);
    let oldInk = 0,
      newInk = 0;
    for (let y = 20; y < 280; y++)
      for (let x = 20; x < 280; x++) {
        if (r.pixels[(y * r.width + x) * 4] < 200) {
          if (y < 130) oldInk++;
          else newInk++;
        }
      }
    expect(oldInk).toBe(0);
    expect(newInk).toBeGreaterThan(100);
    expect(saved.details(0).annotations).toHaveLength(tool === "text" ? 1 : 0);
    const preview = engine.renderAnnotation(0, original.id, 20);
    expect(preview.width * preview.height).toBeLessThan(2_510_000);
    expect(preview.pixels[3]).toBe(0);
    expect(preview.pixels.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    engine.action({ type: "undo" });
    engine
      .details(0)
      .annotations[0].rect.forEach((v, i) =>
        expect(v).toBeCloseTo(original.rect[i], 3),
      );
    engine.action({ type: "redo" });
    engine
      .details(0)
      .annotations[0].rect.forEach((v, i) => expect(v).toBeCloseTo(next[i], 3));
  },
);

test("resizes uploaded signatures without losing their appearance", async () => {
  const engine = new PDFEngine();
  engine.open(
    new Uint8Array(readFileSync("public/field-notes.pdf")),
    "Resize.pdf",
  );
  engine.addMark({
    tool: "image",
    page: 0,
    rect: [20, 20, 260, 80],
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
    rect: [40, 400, 400, 490],
  });
  const preview = engine.renderAnnotation(0, id, 1);
  expect(preview.width).toBe(360);
  expect(preview.height).toBe(90);
  expect(
    preview.pixels.filter((v, i) => i % 4 === 3 && v > 0).length,
  ).toBeGreaterThan(1000);
});

test("moves text in page coordinates after cropping and rotating", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 500]);
  const engine = new PDFEngine();
  engine.open(await doc.save(), "Rotated.pdf");
  const base: Mark = {
    tool: "crop",
    page: 0,
    rect: [30, 40, 330, 440],
    color: "#29372f",
    width: 18,
    opacity: 1,
    author: "Test",
  };
  engine.addMark(base);
  engine.action({ type: "rotate", pages: [0], angle: 90 });
  engine.addMark({
    ...base,
    tool: "text",
    rect: [40, 40, 200, 100],
    text: "Moved text",
  });
  const id = engine.details(0).annotations[0].id;
  engine.action({
    type: "annotation-transform",
    page: 0,
    id,
    rect: [50, 180, 210, 240],
  });
  expect(engine.details(0).annotations[0].rect).toEqual([50, 180, 210, 240]);
  const result = engine.render(0, 1);
  let oldInk = 0,
    newInk = 0;
  for (let y = 20; y < 260; y++)
    for (let x = 20; x < 260; x++) {
      if (result.pixels[(y * result.width + x) * 4] < 200) {
        if (y < 130) oldInk++;
        else newInk++;
      }
    }
  expect(oldInk).toBe(0);
  expect(newInk).toBeGreaterThan(100);
});
