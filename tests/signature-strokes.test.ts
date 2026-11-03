import { test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFEngine } from "../src/lib/engine";
import type { Mark, Point, Rect } from "../src/lib/types";

test("signature strokes stay in one movable, resizable annotation through undo and export", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 500]);
  const engine = new PDFEngine();
  engine.open(await pdf.save(), "Signature.pdf");
  const paths: Point[][] = [
    [
      [50, 60],
      [80, 90],
      [120, 55],
    ],
    [
      [130, 60],
      [160, 90],
      [190, 55],
    ],
    [
      [60, 105],
      [210, 105],
    ],
  ];
  const mark: Mark = {
    tool: "signature",
    page: 0,
    rect: [40, 40, 220, 120],
    signatureGroup: "first-signature",
    color: "#29372f",
    width: 2,
    opacity: 1,
    author: "Test",
  };
  for (const points of paths) engine.addMark({ ...mark, points });
  const original = engine.details(0).annotations;
  expect(original).toHaveLength(1);
  expect(original[0].signatureGroup).toBe("first-signature");
  expect(original[0].text).toBe("Signature");
  const ink = (source: PDFEngine, id: number) => {
    const page = source.require().loadPage(0);
    try {
      return page
        .getAnnotations()
        .find((a) => a.getObject().asIndirect() === id)!
        .getInkList();
    } finally {
      page.destroy();
    }
  };
  const id = original[0].id;
  expect(ink(engine, id)).toEqual(paths);
  engine.action({ type: "undo" });
  expect(ink(engine, id)).toEqual(paths.slice(0, 2));
  engine.action({ type: "redo" });
  expect(ink(engine, id)).toEqual(paths);

  const old = original[0].rect;
  const moved = old.map((v, i) => v + (i % 2 ? 150 : 30)) as Rect;
  engine.action({ type: "annotation-transform", page: 0, id, rect: moved });
  expect(ink(engine, id)).toEqual(
    paths.map((path) => path.map(([x, y]) => [x + 30, y + 150])),
  );
  const resized: Rect = [
    moved[0],
    moved[1],
    moved[0] + 2 * (moved[2] - moved[0]),
    moved[1] + 2 * (moved[3] - moved[1]),
  ];
  engine.action({ type: "annotation-transform", page: 0, id, rect: resized });
  const scaled = ink(engine, id);
  expect(scaled).toHaveLength(3);
  paths.forEach((path, n) =>
    path.forEach(([x, y], i) => {
      expect(scaled[n][i][0]).toBeCloseTo(moved[0] + 2 * (x - old[0]), 3);
      expect(scaled[n][i][1]).toBeCloseTo(moved[1] + 2 * (y - old[1]), 3);
    }),
  );
  const restored = new PDFEngine();
  restored.open(engine.saveEditable(), "Recovery.pdf");
  expect(restored.details(0).annotations).toHaveLength(1);
  expect(ink(restored, restored.details(0).annotations[0].id)).toEqual(scaled);
  engine.addMark({
    ...mark,
    signatureGroup: "second-signature",
    points: paths[0],
  });
  engine.addMark({ ...mark, tool: "ink", points: paths[1] });
  expect(engine.details(0).annotations).toHaveLength(3);
});
