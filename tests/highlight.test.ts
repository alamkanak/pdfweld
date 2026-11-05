import { test, expect } from "vitest";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";
import type { Mark, Tool } from "../src/lib/types";

async function prepare(rotation = 0) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([440, 660]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Alpha beta gamma delta epsilon.", {
    x: 40,
    y: 550,
    font,
    size: 14,
  });
  page.drawText("Second line has selected words.", {
    x: 40,
    y: 525,
    font,
    size: 14,
  });
  page.setRotation(degrees(rotation));
  const engine = new PDFEngine();
  engine.open(await pdf.save(), "Selection.pdf");
  return engine;
}
function selection(
  engine: PDFEngine,
  start: number,
  end: number,
  tool: Tool = "highlight",
): Mark {
  const chars = engine.details(0).lines[0].chars.slice(start, end);
  return {
    tool,
    page: 0,
    rect: [0, 0, 440, 660],
    quads: chars.map((c) => c.quad),
    text: chars.map((c) => c.text).join(""),
    color: "#ffdd33",
    width: 2,
    opacity: 0.45,
    author: "Test",
  };
}
function quads(engine: PDFEngine) {
  const page = engine.require().loadPage(0);
  try {
    return page.getAnnotations().map((a) => a.getQuadPoints());
  } finally {
    page.destroy();
  }
}

test("a tap/rectangle without selected glyphs creates no highlight or undo step", async () => {
  const engine = await prepare();
  const mark = selection(engine, 6, 10);
  delete mark.quads;
  expect(engine.addMark(mark)).toHaveProperty("unchanged", true);
  expect(engine.details(0).annotations).toHaveLength(0);
  expect(engine.info().canUndo).toBe(false);
});

for (const rotation of [0, 90, 180, 270]) {
  test(`glyph selection and duplicate protection survive export at ${rotation} degrees`, async () => {
    const engine = await prepare(rotation);
    const mark = selection(engine, 6, 16);
    engine.addMark(mark);
    expect(engine.details(0).annotations).toHaveLength(1);
    expect(engine.details(0).annotations[0].text).toBe("beta gamma");
    expect(quads(engine)[0]).toHaveLength(1);
    const position = engine.require().getJournal().position;
    for (let i = 0; i < 4; i++)
      expect(engine.addMark(mark)).toHaveProperty("unchanged", true);
    expect(engine.addMark(selection(engine, 11, 16))).toHaveProperty(
      "unchanged",
      true,
    );
    expect(engine.require().getJournal().position).toBe(position);
    const restored = new PDFEngine();
    restored.open(engine.save(), "Export.pdf");
    expect(quads(restored)).toEqual(quads(engine));
    engine.action({ type: "undo" });
    expect(engine.details(0).annotations).toHaveLength(0);
    engine.action({ type: "redo" });
    expect(engine.details(0).annotations).toHaveLength(1);
  });
}

test("partly overlapping highlights add only the previously unmarked glyphs", async () => {
  const engine = await prepare();
  engine.addMark(selection(engine, 6, 16));
  engine.addMark(selection(engine, 11, 22));
  const [first, second] = quads(engine);
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(second[0][0]).toBeGreaterThanOrEqual(first[0][2] - 0.01);
  expect(engine.addMark(selection(engine, 6, 22))).toHaveProperty(
    "unchanged",
    true,
  );
  expect(engine.details(0).annotations).toHaveLength(2);
});

test("imported highlights also prevent stacking, without changing the original annotation", async () => {
  const engine = await prepare();
  const selected = selection(engine, 6, 16);
  engine.addMark(selected);
  const restored = new PDFEngine();
  restored.open(engine.save(), "Original highlight.pdf");
  const original = restored.details(0).annotations;
  expect(restored.addMark(selection(restored, 6, 16))).toHaveProperty(
    "unchanged",
    true,
  );
  expect(restored.details(0).annotations).toEqual(original);
  expect(restored.info().canUndo).toBe(false);
});

test("underline and strikethrough share precise selection and deduplicate independently", async () => {
  const engine = await prepare();
  for (const tool of ["highlight", "underline", "strike"] as Tool[]) {
    const mark = selection(engine, 6, 10, tool);
    engine.addMark(mark);
    expect(engine.addMark(mark)).toHaveProperty("unchanged", true);
  }
  expect(engine.details(0).annotations.map((a) => a.type)).toEqual([
    "Highlight",
    "Underline",
    "StrikeOut",
  ]);
});
